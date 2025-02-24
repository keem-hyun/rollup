import express from 'express';
import { ethers } from 'ethers';
import { Sequencer } from './services/sequencer';
import dotenv from 'dotenv';

dotenv.config();
const app = express();
app.use(express.json());

async function startServer() {
  // Sepolia provider 설정
  const provider = new ethers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL);
  const sequencerWallet = new ethers.Wallet(process.env.SEQUENCER_PRIVATE_KEY!, provider);
  const sequencer = new Sequencer(
    sequencerWallet.address,
    process.env.DEPLOYED_CONTRACT_ADDRESS!,
    sequencerWallet
  );

  // 시퀀서 초기화
  await sequencer.initialize();

  const aliceWallet = ethers.Wallet.createRandom();
  console.log(`Alice's address: ${aliceWallet.address}`);
  console.log(`Alice's private key: ${aliceWallet.privateKey}`);

  const bobWallet = ethers.Wallet.createRandom();
  console.log(`Bob's address: ${bobWallet.address}`);
  console.log(`Bob's private key: ${bobWallet.privateKey}`);

  // API 엔드포인트 설정
  app.post('/transaction', async (req, res) => {
    try {
      const tx = req.body;
      await sequencer.addTransaction(tx);
      res.json({ message: "Transaction accepted" });
    } catch (error) {
      res.status(400).json({ error: error });
    }
  });

  app.get('/pending-transactions', (req, res) => {
    const pending = sequencer.getPendingTransactions();
    res.json({ transactions: pending });
  });

  app.get('/batch/:batchNumber', async (req, res) => {
    const batchNumber = parseInt(req.params.batchNumber);
    const batch = await sequencer.getBatchStatus(batchNumber);
    res.json({ batch });
  });

  // 서명 생성 API
  app.post('/sign-transaction', async (req, res) => {
    try {
      const { from, to, value, data, nonce, privateKey } = req.body;
      
      const wallet = new ethers.Wallet(privateKey);
      
      // 주소 확인
      if (wallet.address.toLowerCase() !== from.toLowerCase()) {
        throw new Error("Private key does not match sender address");
      }

      const messageHash = ethers.keccak256(
        ethers.solidityPacked(
          ['address', 'address', 'uint256', 'bytes', 'uint256'],
          [from, to, value, data, nonce]
        )
      );

      const signature = await wallet.signMessage(
        ethers.getBytes(messageHash)
      );
      
      res.json({ 
        signature,
        transaction: { from, to, value, data, nonce, signature }
      });
    } catch (error) {
      res.status(400).json({ error: error });
    }
  });

  // 챌린지 제출 API
  app.post('/challenge', async (req, res) => {
    try {
      const { batchNumber, fraudProof } = req.body;
      await sequencer.submitChallenge(batchNumber, fraudProof);
      res.json({ message: "Challenge submitted successfully" });
    } catch (error) {
      res.status(400).json({ error: error });
    }
  });

  // 배치 확정 API
  app.post('/finalize/:batchNumber', async (req, res) => {
    try {
      const batchNumber = parseInt(req.params.batchNumber);
      await sequencer.finalizeBatch(batchNumber);  // sequencer의 메서드 사용
      res.json({ message: "Batch finalized successfully" });
    } catch (error) {
      res.status(400).json({ error: error });
    }
  });

  const PORT = 3000;
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer().catch(console.error);