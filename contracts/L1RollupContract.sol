// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract L1RollupContract is Ownable, ReentrancyGuard {
    // 배치 구조체
    struct BatchHeader {
        uint256 batchNumber;
        uint256 timestamp;
        bytes32 previousBatchHash;
        bytes32 transactionRoot;
        bytes32 stateRoot;      
    }

    struct BatchContext {
        address submitter;
        uint256 timestamp;
        uint256 challengePeriodEnd;
    }

    struct Batch {
        BatchHeader header;
        BatchContext context;
        bool finalized;
        bool challenged;
    }

    // 상태 변수
    mapping(uint256 => Batch) public batches;
    uint256 public latestBatchNumber;
    uint256 public constant CHALLENGE_PERIOD = 5 minutes;
    mapping(uint256 => mapping(address => bool)) public challenges;
    
    // 이벤트
    event BatchSubmitted(uint256 indexed batchNumber, bytes32 transactionRoot, bytes32 stateRoot);
    event ChallengeSubmitted(uint256 indexed batchNumber, address challenger);
    event BatchFinalized(uint256 indexed batchNumber);
    event BatchRollback(uint256 indexed batchNumber);

    constructor() Ownable(msg.sender) {}

    // 배치 제출
    function submitBatch(
        uint256 batchNumber,
        uint256 timestamp,
        bytes32 previousBatchHash,
        bytes32 transactionRoot,
        bytes32 stateRoot
    ) external nonReentrant {
        require(batchNumber == latestBatchNumber + 1, "Invalid batch number");
        
        if (latestBatchNumber > 0) {
            require(
                previousBatchHash == keccak256(
                    abi.encodePacked(
                        batches[latestBatchNumber].header.batchNumber,
                        batches[latestBatchNumber].header.timestamp,
                        batches[latestBatchNumber].header.previousBatchHash,
                        batches[latestBatchNumber].header.transactionRoot
                    )
                ),
                "Invalid previous batch hash"
            );
        }

        Batch storage newBatch = batches[batchNumber];
        newBatch.header = BatchHeader({
            batchNumber: batchNumber,
            timestamp: timestamp,
            previousBatchHash: previousBatchHash,
            transactionRoot: transactionRoot,
            stateRoot: stateRoot
        });

        newBatch.context = BatchContext({
            submitter: msg.sender,
            timestamp: block.timestamp,
            challengePeriodEnd: block.timestamp + CHALLENGE_PERIOD
        });

        latestBatchNumber = batchNumber;
        
        emit BatchSubmitted(batchNumber, transactionRoot, stateRoot);
    }

    struct StateProof {
        bytes32 preStateRoot;    
        bytes32 postStateRoot;   
        bytes32[] accountProof;  
        bytes32[] storageProof;  
    }

    function verifyFraudProof(
        uint256 batchNumber,
        bytes calldata fraudProof
    ) internal view returns (bool) {
        (
            bytes32 txHash,
            bytes memory txData,
            StateProof memory stateProof,
            bytes memory executionProof
        ) = abi.decode(fraudProof, (bytes32, bytes, StateProof, bytes));

        // 1. 트랜잭션 존재 증명 검증
        require(
            verifyTransactionInclusion(
                txHash,
                batches[batchNumber].header.transactionRoot,
                txData
            ),
            "Transaction not included in batch"
        );

        // 2. 상태 전이 검증
        require(
            verifyStateTransition(
                stateProof,
                batches[batchNumber].header.stateRoot
            ),
            "Invalid state transition"
        );

        // 3. 트랜잭션 실행 결과 검증
        require(
            verifyExecution(txData, stateProof, executionProof),
            "Invalid execution result"
        );

        return true;
    }

    function verifyTransactionInclusion(
        bytes32 txHash,
        bytes32 txRoot,
        bytes memory txData
    ) internal pure returns (bool) {
        // 트랜잭션 해시 검증
        require(keccak256(txData) == txHash, "Invalid transaction hash");
        
        // 머클 증명 검증
        // 실제 구현에서는 머클 트리 증명 로직 추가
        return true;
    }

    function verifyStateTransition(
        StateProof memory proof,
        bytes32 claimedStateRoot
    ) internal pure returns (bool) {
        // 1. 계정 상태 증명 검증
        require(
            verifyMerkleProof(proof.accountProof, proof.preStateRoot),
            "Invalid account proof"
        );

        // 2. 스토리지 상태 증명 검증
        require(
            verifyMerkleProof(proof.storageProof, proof.postStateRoot),
            "Invalid storage proof"
        );

        // 3. 최종 상태 루트 검증
        require(claimedStateRoot == proof.postStateRoot, "Invalid state root");

        return true;
    }

    function verifyExecution(
        bytes memory txData,
        StateProof memory stateProof,
        bytes memory executionProof
    ) internal pure returns (bool) {
        // 1. 트랜잭션 데이터 파싱
        (
            address from,
            address to,
            uint256 value,
            bytes memory data
        ) = abi.decode(txData, (address, address, uint256, bytes));

        // 2. 실행 컨텍스트 재구성
        bytes32 executionHash = keccak256(
            abi.encodePacked(
                from,
                to,
                value,
                data,
                stateProof.preStateRoot
            )
        );

        // 3. 실행 결과 검증
        bytes32 expectedResult = keccak256(executionProof);
        require(
            expectedResult == stateProof.postStateRoot,
            "Execution result mismatch"
        );

        return true;
    }

    function verifyMerkleProof(
        bytes32[] memory proof,
        bytes32 root
    ) internal pure returns (bool) {
        bytes32 computedHash = proof[0];
        
        for (uint256 i = 1; i < proof.length; i++) {
            bytes32 proofElement = proof[i];
            
            if (computedHash <= proofElement) {
                computedHash = keccak256(abi.encodePacked(computedHash, proofElement));
            } else {
                computedHash = keccak256(abi.encodePacked(proofElement, computedHash));
            }
        }
        
        return computedHash == root;
    }

    // 배치 롤백
    function rollbackBatch(uint256 batchNumber) internal {
        require(batches[batchNumber].challenged, "Batch not challenged");
        
        // 해당 배치 이후의 모든 배치를 무효화
        for (uint256 i = latestBatchNumber; i >= batchNumber; i--) {
            delete batches[i];
            emit BatchRollback(i);
        }
        
        latestBatchNumber = batchNumber - 1;
    }

    // 배치 확정
    function finalizeBatch(uint256 batchNumber) external {
        require(batchNumber <= latestBatchNumber, "Batch does not exist");
        require(!batches[batchNumber].finalized, "Already finalized");
        require(
            block.timestamp > batches[batchNumber].context.challengePeriodEnd,
            "Challenge period not ended"
        );
        require(!batches[batchNumber].challenged, "Batch was challenged");

        batches[batchNumber].finalized = true;
        emit BatchFinalized(batchNumber);
    }

    // 챌린지 제출
    function submitChallenge(
        uint256 batchNumber,
        bytes calldata fraudProof
    ) external nonReentrant {
        require(batchNumber <= latestBatchNumber, "Batch does not exist");
        require(!batches[batchNumber].finalized, "Batch already finalized");
        require(
            block.timestamp <= batches[batchNumber].context.challengePeriodEnd,
            "Challenge period ended"
        );
        require(!batches[batchNumber].challenged, "Already challenged");
        require(!challenges[batchNumber][msg.sender], "Already challenged by this address");

        // 사기 증명 검증
        require(verifyFraudProof(batchNumber, fraudProof), "Invalid fraud proof");

        // 챌린지 상태 업데이트
        batches[batchNumber].challenged = true;
        challenges[batchNumber][msg.sender] = true;

        emit ChallengeSubmitted(batchNumber, msg.sender);

        // 배치 롤백 실행
        rollbackBatch(batchNumber);
    }

    // Getter 함수들
    function getLatestBatchNumber() external view returns (uint256) {
        return latestBatchNumber;
    }

    function getLatestBatchHash() external view returns (bytes32) {
        return keccak256(
            abi.encodePacked(
                batches[latestBatchNumber].header.batchNumber,
                batches[latestBatchNumber].header.timestamp,
                batches[latestBatchNumber].header.previousBatchHash,
                batches[latestBatchNumber].header.transactionRoot
            )
        );
    }
} 