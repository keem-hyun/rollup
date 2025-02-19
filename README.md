## optimistic rollup

## Sequencer
- 트랜잭션 수집
- 배치 생성 및 제출

## Batcher
- 배치 처리
- 트랜잭션 실행
- 상태 관리

## 프로세스

1. 롤업에 트랜잭션을 제출하면 시퀀서가 트랜잭션을 받는다

2. 시퀀서가 트랜잭션을 배치로 만든다

3. 일정량의 트랜잭션이 모이면 L1에 배치를 제출한다

4. 배치는 헤더 / 배치 컨텍스트 / 트랜잭션을 가진다

5. 온체인에서 challenge 기간을 가진다

6. challenge가 들어오면 사기 증명을 하고 사기인 게 판명되면 트랜잭션을 취소시켜야 한다

## 상태 관리
- L2 상태(State)는 계정 잔액과 스마트 컨트랙트 상태를 포함한다
- 각 트랜잭션 실행 후 상태가 업데이트된다

## 사기 증명

## Challenge 시스템
- Challenge 기간: 7일
- Challenge 가능한 조건:
  - 잘못된 상태 전이
  - 유효하지 않은 트랜잭션 포함


## 전송 -> 배치 생성 -> 배치 제출 -> 배치 처리 -> 상태 업데이트 프로세스

1. 사용자 → 시퀀서 RPC로 트랜잭션 전송

2. 시퀀서가 트랜잭션 수집 (mempool)

3. 시퀀서가 트랜잭션 실행 및 블록 생성
   - 이 시점에서 "unsafe" 상태

4. Batcher가 L1 롤업 컨트랙트에 배치 데이터 제출
   - 이 시점에서 "safe" 상태

5. L1 블록이 충분한 확정(finality)을 얻으면
   - 이 시점에서 "finalized" 상태

6. L2 노드들이 L1의 배치 데이터를 읽어서
   - L2 상태를 재구성
   - 로컬 상태 업데이트