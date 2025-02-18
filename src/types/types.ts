export interface Transaction {
  from: string;
  to: string;
  value: bigint;
  data: string;
  nonce: number;
  signature: string;
}

export interface BatchHeader {
  batchNumber: number;
  timestamp: number;
  previousBatchHash: string;
  transactionRoot: string;
}

export interface BatchContext {
  submitter: string;
  timestamp: number;
  challengePeriodEnd: number;
}

export interface Batch {
  header: BatchHeader;
  context: BatchContext;
  transactions: Transaction[];
}