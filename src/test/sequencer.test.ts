import { expect } from 'chai';
import { ethers } from 'ethers';
import { Sequencer } from '../services/sequencer';
import { Transaction } from '../types/types';

describe('Sequencer', () => {
  let sequencer: Sequencer;
  
  beforeEach(async () => {
    // 테스트용 시퀀서 초기화
    sequencer = new Sequencer(
      "0x1234567890123456789012345678901234567890",
      "0x1234567890123456789012345678901234567891",
      ethers.getDefaultProvider()
    );
  });

  describe('calculateTransactionRoot', () => {
    it('단일 트랜잭션에 대한 머클 루트 계산', async () => {
      const transaction: Transaction = {
        from: "0x1234567890123456789012345678901234567892",
        to: "0x1234567890123456789012345678901234567893",
        value: BigInt(1000),
        data: "0x",
        nonce: 1,
        signature: "0x1234567890"
      };

      const root = await (sequencer as any).calculateTransactionRoot([transaction]);
      expect(root).to.be.a('string');
      expect(root).to.match(/^0x[0-9a-f]{64}$/i);
    });

    it('여러 트랜잭션에 대한 머클 루트 계산', async () => {
      const transactions: Transaction[] = [
        {
          from: "0x1234567890123456789012345678901234567894",
          to: "0x1234567890123456789012345678901234567895",
          value: BigInt(1000),
          data: "0x",
          nonce: 1,
          signature: "0x1234567890"
        },
        {
          from: "0x1234567890123456789012345678901234567896",
          to: "0x1234567890123456789012345678901234567897",
          value: BigInt(2000),
          data: "0x",
          nonce: 2,
          signature: "0x1234567891"
        },
        {
          from: "0x1234567890123456789012345678901234567898",
          to: "0x1234567890123456789012345678901234567899",
          value: BigInt(3000),
          data: "0x",
          nonce: 3,
          signature: "0x1234567892"
        },
        {
          from: "0x123456789012345678901234567890123456789a",
          to: "0x123456789012345678901234567890123456789b",
          value: BigInt(4000),
          data: "0x",
          nonce: 4,
          signature: "0x1234567893"
        },
        {
          from: "0x123456789012345678901234567890123456789c",
          to: "0x123456789012345678901234567890123456789d",
          value: BigInt(5000),
          data: "0x",
          nonce: 5,
          signature: "0x1234567894"
        },
        {
          from: "0x123456789012345678901234567890123456789e",
          to: "0x123456789012345678901234567890123456789f",
          value: BigInt(6000),
          data: "0x",
          nonce: 6,
          signature: "0x1234567895"
        },
        {
          from: "0x12345678901234567890123456789012345678a0",
          to: "0x12345678901234567890123456789012345678a1",
          value: BigInt(7000),
          data: "0x",
          nonce: 7,
          signature: "0x1234567896"
        },
        {
          from: "0x12345678901234567890123456789012345678a2",
          to: "0x12345678901234567890123456789012345678a3",
          value: BigInt(8000),
          data: "0x",
          nonce: 8,
          signature: "0x1234567897"
        },
        {
          from: "0x12345678901234567890123456789012345678a4",
          to: "0x12345678901234567890123456789012345678a5",
          value: BigInt(9000),
          data: "0x",
          nonce: 9,
          signature: "0x1234567898"
        },
        {
          from: "0x12345678901234567890123456789012345678a6",
          to: "0x12345678901234567890123456789012345678a7",
          value: BigInt(10000),
          data: "0x",
          nonce: 10,
          signature: "0x1234567899"
        }
      ];

      const root = await (sequencer as any).calculateTransactionRoot(transactions);
      expect(root).to.be.a('string');
      expect(root).to.match(/^0x[0-9a-f]{64}$/i);
    });

    it('동일한 트랜잭션 목록에 대해 동일한 루트 반환', async () => {
      const transactions: Transaction[] = [
        {
          from: "0x1234567890123456789012345678901234567894",
          to: "0x1234567890123456789012345678901234567895",
          value: BigInt(1000),
          data: "0x",
          nonce: 1,
          signature: "0x1234567890"
        },
        {
          from: "0x1234567890123456789012345678901234567896",
          to: "0x1234567890123456789012345678901234567897",
          value: BigInt(2000),
          data: "0x",
          nonce: 2,
          signature: "0x1234567891"
        }
      ];

      const root1 = await (sequencer as any).calculateTransactionRoot(transactions);
      const root2 = await (sequencer as any).calculateTransactionRoot(transactions);
      expect(root1).to.equal(root2);
    });

    it('트랜잭션 순서가 다르면 다른 루트 반환', async () => {
      const transactions1: Transaction[] = [
        {
          from: "0x1234567890123456789012345678901234567894",
          to: "0x1234567890123456789012345678901234567895",
          value: BigInt(1000),
          data: "0x",
          nonce: 1,
          signature: "0x1234567890"
        },
        {
          from: "0x1234567890123456789012345678901234567896",
          to: "0x1234567890123456789012345678901234567897",
          value: BigInt(2000),
          data: "0x",
          nonce: 2,
          signature: "0x1234567891"
        }
      ];

      const transactions2 = [...transactions1].reverse();

      const root1 = await (sequencer as any).calculateTransactionRoot(transactions1);
      const root2 = await (sequencer as any).calculateTransactionRoot(transactions2);
      expect(root1).to.not.equal(root2);
    });

    it('빈 트랜잭션 목록에 대한 처리', async () => {
      const root = await (sequencer as any).calculateTransactionRoot([]);
      expect(root).to.equal(ethers.keccak256('0x'));
    });
  });
});
