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
    provider: ethers.Provider
  ) {
    this.address = sequencerAddress;
    
    // L1 컨트랙트 ABI (실제 구현시에는 별도 파일로 분리)
    const abi = [
      "function getLatestBatchNumber() view returns (uint256)",
      "function getLatestBatchHash() view returns (bytes32)"
    ];
    
    this.l1Contract = new ethers.Contract(l1ContractAddress, abi, provider);
  }

  async initialize(): Promise<void> {
    try {
      // L1 컨트랙트에서 최신 배치 정보 조회
      this.batchNumber = await this.l1Contract.getLatestBatchNumber();
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
      // 1. 서명 검증
      // keccak256 해시화
      const messageHash = ethers.keccak256(
        // ABI 인코딩
        ethers.solidityPacked(
          ['address', 'address', 'uint256', 'bytes', 'uint256'],
          [transaction.from, transaction.to, transaction.value, transaction.data, transaction.nonce]
        )
      );

      // 서명으로부터 서명자의 주소 복구
      const recoveredAddress = ethers.recoverAddress(messageHash, transaction.signature);
      // 주소 검증
      if (recoveredAddress !== transaction.from) return false;

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
    // L1 컨트랙트에 배치를 제출하는 로직
    // 실제 구현에서는 L1 컨트랙트와 상호작용
    console.log('Submitting batch to L1:', batch);
  }
} 