import { Transaction, Batch } from '../types/types';
import { ethers } from 'ethers';

export class Sequencer {
  private batchNumber!: number;
  private lastBatchHash!: string;
  private pendingTransactions: Transaction[] = [];
  private readonly BATCH_SIZE = 10;
  private address: string;
  private l1Contract: ethers.Contract;
  private initialized: boolean = false;

  constructor(
    sequencerAddress: string,
    l1ContractAddress: string,
    signer: ethers.Signer
  ) {
    this.address = sequencerAddress;
    
    // L1 컨트랙트 ABI
    const abi = [
      "function getLatestBatchNumber() view returns (uint256)",
      "function getLatestBatchHash() view returns (bytes32)",
      "function batches(uint256) view returns (tuple(tuple(uint256 batchNumber, uint256 timestamp, bytes32 previousBatchHash, bytes32 transactionRoot, bytes32 stateRoot) header, tuple(address submitter, uint256 timestamp, uint256 challengePeriodEnd) context, bool finalized, bool challenged))",
      "function submitBatch(uint256 batchNumber, uint256 timestamp, bytes32 previousBatchHash, bytes32 transactionRoot, bytes32 stateRoot) external",
      "function submitChallenge(uint256 batchNumber, bytes calldata fraudProof) external",
      "function finalizeBatch(uint256 batchNumber) external"
    ];
    
    this.l1Contract = new ethers.Contract(l1ContractAddress, abi, signer);
  }

  async initialize(): Promise<void> {
    try {
      // L1 컨트랙트에서 최신 배치 정보 조회
      const latestBatchNumber = await this.l1Contract.getLatestBatchNumber();
      // bigint를 number로 변환 (Number() 사용)
      this.batchNumber = Number(latestBatchNumber) + 1;
      
      // 마지막 배치 해시 가져오기
      this.lastBatchHash = await this.l1Contract.getLatestBatchHash();
      
      console.log(`Sequencer initialized with batch number: ${this.batchNumber}`);
      console.log(`Last batch hash: ${this.lastBatchHash}`);
      
      this.initialized = true;
    } catch (error) {
      console.error('Failed to initialize sequencer:', error);
      throw new Error('Sequencer initialization failed: Unable to fetch state from L1');
    }
  }
  
  async addTransaction(transaction: Transaction): Promise<void> {
    if (!this.initialized) {
      throw new Error('Sequencer not initialized');
    }
    
    if (await this.validateTransaction(transaction)) {
      this.pendingTransactions.push(transaction);
      
      if (this.pendingTransactions.length >= this.BATCH_SIZE) {
        await this.createAndSubmitBatch();
      }
    } else {
      throw new Error("Invalid transaction");
    }
  }

  private async validateTransaction(transaction: Transaction): Promise<boolean> {
    try {
      const messageHash = ethers.keccak256(
        ethers.solidityPacked(
          ['address', 'address', 'uint256', 'bytes', 'uint256'],
          [transaction.from, transaction.to, transaction.value, transaction.data, transaction.nonce]
        )
      );

      const recoveredAddress = ethers.verifyMessage(
        ethers.getBytes(messageHash),
        transaction.signature
      );

      if (recoveredAddress.toLowerCase() !== transaction.from.toLowerCase()) {
        return false;
      }

      return true;
    } catch (error) {
      console.error('Transaction validation failed:', error);
      return false;
    }
  }

  private async createAndSubmitBatch(): Promise<void> {
    const batch = await this.createBatch();
    await this.submitBatchToL1(batch);
    
    // 배치 제출 후 상태 업데이트
    this.lastBatchHash = this.calculateBatchHash(batch);
    this.batchNumber++;
    this.pendingTransactions = [];
  }

  private async createBatch(): Promise<Batch> {
    const timestamp = Date.now();
    const transactionRoot = this.calculateTransactionRoot(this.pendingTransactions);

    return {
      header: {
        batchNumber: this.batchNumber,
        timestamp,
        previousBatchHash: this.lastBatchHash,
        transactionRoot
      },
      context: {
        submitter: this.address,
        timestamp,
        challengePeriodEnd: timestamp + 7 * 24 * 60 * 60 * 1000 // 7일
      },
      transactions: [...this.pendingTransactions]
    };
  }

  private calculateTransactionRoot(transactions: Transaction[]): string {
    // 1. 각 트랜잭션의 해시 계산
    const leaves = transactions.map(tx => 
      ethers.keccak256(ethers.solidityPacked(
        ['address', 'address', 'uint256', 'bytes', 'uint256', 'bytes'],
        [tx.from, tx.to, tx.value, tx.data, tx.nonce, tx.signature]
      ))
    );

    // 2. 머클 트리 구성
    const layers = [leaves];
    
    while (layers[0].length > 1) {
      const currentLayer = layers[0];
      const newLayer = [];
      
      // 현재 레이어의 노드들을 둘씩 짝지어서 상위 레이어 구성
      for (let i = 0; i < currentLayer.length; i += 2) {
        const left = currentLayer[i];
        const right = i + 1 < currentLayer.length ? currentLayer[i + 1] : left;
        
        const combined = ethers.keccak256(
          ethers.solidityPacked(['bytes32', 'bytes32'], [left, right])
        );
        newLayer.push(combined);
      }
      
      layers.unshift(newLayer);
    }

    return layers[0][0]; // 머클 루트 반환
  }

  private calculateBatchHash(batch: Batch): string {
    return ethers.keccak256(
      ethers.solidityPacked(
        ['uint256', 'uint256', 'string', 'string'],
        [
          batch.header.batchNumber,
          batch.header.timestamp,
          batch.header.previousBatchHash,
          batch.header.transactionRoot
        ]
      )
    );
  }

  private async submitBatchToL1(batch: Batch): Promise<void> {
    try {
      console.log('Submitting batch to L1:', batch);

      // L1 컨트랙트의 submitBatch 함수 호출
      const tx = await this.l1Contract.submitBatch(
        batch.header.batchNumber,
        batch.header.timestamp,
        batch.header.previousBatchHash,
        batch.header.transactionRoot,
        "0x0000000000000000000000000000000000000000000000000000000000000000" // stateRoot (현재는 더미값)
      );
      
      // 트랜잭션 완료 대기
      const receipt = await tx.wait();
      
      if (receipt.status === 0) {
        throw new Error('Transaction failed');
      }
      
      console.log(`Batch ${batch.header.batchNumber} submitted to L1. Transaction hash: ${receipt.hash}`);
    } catch (error) {
      console.error('Failed to submit batch to L1:', error);
      throw new Error(`Failed to submit batch to L1: ${error}`);
    }
  }

  // pending 트랜잭션 조회 메서드 추가
  public getPendingTransactions(): Transaction[] {
    return [...this.pendingTransactions];
  }

  // 배치 상태 조회 메서드 추가
  public async getBatchStatus(batchNumber: number): Promise<any> {
    try {
      // 초기화 확인
      if (!this.initialized) {
        throw new Error('Sequencer not initialized');
      }

      // 현재 배치 번호보다 큰 번호 요청 시
      if (batchNumber > this.batchNumber) {
        return null;
      }

      // 메모리에 있는 배치 정보 반환 (아직 L1에 제출되지 않은 경우)
      if (batchNumber === this.batchNumber && this.pendingTransactions.length > 0) {
        return {
          header: {
            batchNumber: this.batchNumber.toString(),
            timestamp: Date.now().toString(),
            previousBatchHash: this.lastBatchHash,
            transactionRoot: this.calculateTransactionRoot(this.pendingTransactions),
            stateRoot: "0x0000000000000000000000000000000000000000000000000000000000000000"
          },
          context: {
            submitter: this.address,
            timestamp: Date.now().toString(),
            challengePeriodEnd: (Date.now() + 5 * 60 * 1000).toString()
          },
          finalized: false,
          challenged: false,
          transactions: this.pendingTransactions
        };
      }

      // L1에서 배치 정보 조회
      const batch = await this.l1Contract.batches(batchNumber);
      
      if (!batch || !batch.header) {
        return null;
      }

      return {
        header: {
          batchNumber: batch.header.batchNumber.toString(),
          timestamp: batch.header.timestamp.toString(),
          previousBatchHash: batch.header.previousBatchHash,
          transactionRoot: batch.header.transactionRoot,
          stateRoot: batch.header.stateRoot
        },
        context: {
          submitter: batch.context.submitter,
          timestamp: batch.context.timestamp.toString(),
          challengePeriodEnd: batch.context.challengePeriodEnd.toString()
        },
        finalized: batch.finalized,
        challenged: batch.challenged
      };
    } catch (error) {
      console.error('Failed to get batch status:', error);
      throw new Error(`Failed to get batch status: ${error}`);
    }
  }

  async submitChallenge(batchNumber: number, fraudProof: string): Promise<void> {
    try {
      console.log(`Submitting challenge for batch ${batchNumber}`);
      
      const tx = await this.l1Contract.submitChallenge(batchNumber, fraudProof);
      const receipt = await tx.wait();
      
      if (receipt.status === 0) {
        throw new Error('Challenge submission failed');
      }
      
      console.log(`Challenge submitted for batch ${batchNumber}. Transaction hash: ${receipt.hash}`);
    } catch (error) {
      console.error('Failed to submit challenge:', error);
      throw new Error(`Failed to submit challenge: ${error}`);
    }
  }

  async finalizeBatch(batchNumber: number): Promise<void> {
    try {
      const tx = await this.l1Contract.finalizeBatch(batchNumber);
      const receipt = await tx.wait();
      
      if (receipt.status === 0) {
        throw new Error('Batch finalization failed');
      }
      
      console.log(`Batch ${batchNumber} finalized`);
    } catch (error) {
      console.error('Failed to finalize batch:', error);
      throw new Error(`Failed to finalize batch: ${error}`);
    }
  }
} 