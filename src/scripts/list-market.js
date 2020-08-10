import {
  Account,
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
} from '@solana/web3.js';
import { MARKET_STATE_LAYOUT } from '../market';
import {
  initializeAccount,
  initializeMint,
  TOKEN_PROGRAM_ID,
} from '../token-instructions';
import BN from '../../node_modules/bn.js/lib/bn';
import { DEX_PROGRAM_ID, DexInstructions } from '../instructions';
import { homedir } from 'os';
import { readFile } from 'fs';
import { promisify } from 'util';

export async function send() {
  const payer = new Account(
    Buffer.from(
      JSON.parse(
        // @ts-ignore
        await promisify(readFile)(homedir() + '/.config/solana/id.json'),
      ),
    ),
  );

  const connection = new Connection('http://localhost:8899', 'recent');
  // const connection = new Connection(
  //   'https://api.mainnet-beta.solana.com',
  //   'recent',
  // );
  const market = new Account();
  const requestQueue = new Account();
  const eventQueue = new Account();
  const bids = new Account();
  const asks = new Account();
  const baseVault = new Account();
  const quoteVault = new Account();
  const baseMint = new Account();
  const quoteMint = new Account();
  const baseLotSize = new BN(10000);
  const quoteLotSize = new BN(10);
  const feeRateBps = 1;
  const quoteDustThreshold = new BN(5);

  async function getVaultOwnerAndNonce() {
    const nonce = new BN(0);
    while (true) {
      try {
        // @ts-ignore
        const vaultOwner = await PublicKey.createProgramAddress(
          [market.publicKey.toBuffer(), nonce.toArrayLike(Buffer, 'le', 8)],
          DEX_PROGRAM_ID,
        );
        return [vaultOwner, nonce];
      } catch (e) {
        nonce.iaddn(1);
      }
    }
  }
  const [vaultOwner, vaultSignerNonce] = await getVaultOwnerAndNonce();

  const transaction1 = new Transaction();
  transaction1.add(
    SystemProgram.createAccount({
      fromPubkey: payer.publicKey,
      newAccountPubkey: baseMint.publicKey,
      lamports: await connection.getMinimumBalanceForRentExemption(82),
      space: 82,
      programId: TOKEN_PROGRAM_ID,
    }),
    SystemProgram.createAccount({
      fromPubkey: payer.publicKey,
      newAccountPubkey: quoteMint.publicKey,
      lamports: await connection.getMinimumBalanceForRentExemption(82),
      space: 82,
      programId: TOKEN_PROGRAM_ID,
    }),
    SystemProgram.createAccount({
      fromPubkey: payer.publicKey,
      newAccountPubkey: baseVault.publicKey,
      lamports: await connection.getMinimumBalanceForRentExemption(165),
      space: 165,
      programId: TOKEN_PROGRAM_ID,
    }),
    SystemProgram.createAccount({
      fromPubkey: payer.publicKey,
      newAccountPubkey: quoteVault.publicKey,
      lamports: await connection.getMinimumBalanceForRentExemption(165),
      space: 165,
      programId: TOKEN_PROGRAM_ID,
    }),
    initializeMint({
      mint: baseMint.publicKey,
      decimals: 4,
      mintAuthority: payer.publicKey,
    }),
    initializeMint({
      mint: quoteMint.publicKey,
      decimals: 4,
      mintAuthority: payer.publicKey,
    }),
    initializeAccount({
      account: baseVault.publicKey,
      mint: baseMint.publicKey,
      owner: vaultOwner,
    }),
    initializeAccount({
      account: quoteVault.publicKey,
      mint: quoteMint.publicKey,
      owner: vaultOwner,
    }),
  );

  const transaction2 = new Transaction();
  transaction2.add(
    SystemProgram.createAccount({
      fromPubkey: payer.publicKey,
      newAccountPubkey: market.publicKey,
      lamports: await connection.getMinimumBalanceForRentExemption(
        MARKET_STATE_LAYOUT.span,
      ),
      space: MARKET_STATE_LAYOUT.span,
      programId: DEX_PROGRAM_ID,
    }),
    SystemProgram.createAccount({
      fromPubkey: payer.publicKey,
      newAccountPubkey: requestQueue.publicKey,
      lamports: await connection.getMinimumBalanceForRentExemption(5120 + 12),
      space: 5120 + 12,
      programId: DEX_PROGRAM_ID,
    }),
    SystemProgram.createAccount({
      fromPubkey: payer.publicKey,
      newAccountPubkey: eventQueue.publicKey,
      lamports: await connection.getMinimumBalanceForRentExemption(65536 + 12),
      space: 65536 + 12,
      programId: DEX_PROGRAM_ID,
    }),
    SystemProgram.createAccount({
      fromPubkey: payer.publicKey,
      newAccountPubkey: bids.publicKey,
      lamports: await connection.getMinimumBalanceForRentExemption(65536 + 12),
      space: 65536 + 12,
      programId: DEX_PROGRAM_ID,
    }),
    SystemProgram.createAccount({
      fromPubkey: payer.publicKey,
      newAccountPubkey: asks.publicKey,
      lamports: await connection.getMinimumBalanceForRentExemption(65536 + 12),
      space: 65536 + 12,
      programId: DEX_PROGRAM_ID,
    }),
  );

  const transaction3 = new Transaction();
  transaction3.add(
    DexInstructions.initializeMarket({
      market: market.publicKey,
      requestQueue: requestQueue.publicKey,
      eventQueue: eventQueue.publicKey,
      bids: bids.publicKey,
      asks: asks.publicKey,
      baseVault: baseVault.publicKey,
      quoteVault: quoteVault.publicKey,
      baseMint: baseMint.publicKey,
      quoteMint: quoteMint.publicKey,
      baseLotSize,
      quoteLotSize,
      feeRateBps,
      vaultSignerNonce,
      quoteDustThreshold,
    }),
  );

  console.log('Paying fees from:', payer.publicKey.toBase58());
  console.log('New market address:', market.publicKey.toBase58());

  await Promise.all([
    (async () => {
      const txid = await connection.sendTransaction(transaction1, [
        payer,
        baseMint,
        quoteMint,
        baseVault,
        quoteVault,
      ]);
      console.log('Sent #1:', txid);
      await connection.confirmTransaction(txid);
      console.log('Confirmed', txid);
    })(),

    (async () => {
      const txid = await connection.sendTransaction(transaction2, [
        payer,
        market,
        requestQueue,
        eventQueue,
        bids,
        asks,
      ]);
      console.log('Sent #2:', txid);
      await connection.confirmTransaction(txid);
      console.log('Confirmed', txid);
    })(),
  ]);

  const txid = await connection.sendTransaction(transaction3, [payer]);
  console.log('Sent #3:', txid);
  await connection.confirmTransaction(txid, 1);
  console.log('Confirmed', txid);
}

send().catch((e) => console.warn(e));
