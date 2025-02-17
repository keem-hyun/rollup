## Sequencer
- 트랜잭션 수집 및 검증
- 배치 생성 및 제출
- 트랜잭션 인코딩

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