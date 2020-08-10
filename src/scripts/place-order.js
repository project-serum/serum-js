import {
  Account,
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
} from '@solana/web3.js';
import { Market } from '../market';
import { homedir } from 'os';
import { readFile } from 'fs';
import { promisify } from 'util';
import {
  initializeAccount,
  mintTo,
  TOKEN_PROGRAM_ID,
} from '../token-instructions';

export async function send() {
  const owner = new Account(
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
  const marketAddress = new PublicKey(
    'HkV2XqyxQRsavC2FbtZZuh9oMimviuqktLysvQMgTZX5',
  );
  const market = await Market.load(connection, marketAddress, {
    skipPreflight: true,
    confirmations: 1,
  });
  const baseTokenAccounts = await market.findBaseTokenAccountsForOwner(
    connection,
    owner.publicKey,
  );
  const quoteTokenAccounts = await market.findQuoteTokenAccountsForOwner(
    connection,
    owner.publicKey,
  );
  if (baseTokenAccounts.length === 0) {
    const tx = new Transaction();
    const newAccount = new Account();
    tx.add(
      SystemProgram.createAccount({
        fromPubkey: owner.publicKey,
        newAccountPubkey: newAccount.publicKey,
        lamports: await connection.getMinimumBalanceForRentExemption(165),
        space: 165,
        programId: TOKEN_PROGRAM_ID,
      }),
      initializeAccount({
        account: newAccount.publicKey,
        mint: market.baseMintAddress,
        owner: owner.publicKey,
      }),
      mintTo({
        mint: market.baseMintAddress,
        mintAuthority: owner.publicKey,
        destination: newAccount.publicKey,
        amount: 1000000,
      }),
    );
    console.log(
      'mint',
      await connection.sendTransaction(tx, [owner, newAccount]),
    );
  }
  if (quoteTokenAccounts.length === 0) {
    const tx = new Transaction();
    const newAccount = new Account();
    tx.add(
      SystemProgram.createAccount({
        fromPubkey: owner.publicKey,
        newAccountPubkey: newAccount.publicKey,
        lamports: await connection.getMinimumBalanceForRentExemption(165),
        space: 165,
        programId: TOKEN_PROGRAM_ID,
      }),
      initializeAccount({
        account: newAccount.publicKey,
        mint: market.quoteMintAddress,
        owner: owner.publicKey,
      }),
      mintTo({
        mint: market.quoteMintAddress,
        mintAuthority: owner.publicKey,
        destination: newAccount.publicKey,
        amount: 1000000,
      }),
    );
    console.log(
      'mint',
      await connection.sendTransaction(tx, [owner, newAccount]),
    );
  }
  console.log(baseTokenAccounts[0].pubkey.toBase58());
  const openOrdersAccounts = await market.findOpenOrdersAccountsForOwner(
    connection,
    owner.publicKey,
  );
  console.log(openOrdersAccounts.length);
  console.log(
    'baseTokenTotal:',
    openOrdersAccounts[0]?.baseTokenTotal.toNumber(),
  );
  console.log(
    'baseTokenFree:',
    openOrdersAccounts[0]?.baseTokenFree.toNumber(),
  );
  let cancelled = false;
  for (const order of await market.loadOrdersForOwner(
    connection,
    owner.publicKey,
  )) {
    console.log(order);
    console.log('cancel', await market.cancelOrder(connection, owner, order));
    cancelled = true;
  }

  if (!cancelled) {
    console.log(
      'placeOrder',
      await market.placeOrder(connection, {
        owner,
        payer: baseTokenAccounts[0].pubkey,
        side: 'sell',
        size: 1,
        price: 1,
      }),
    );
  }

  console.log('requestQueue:', await market.loadRequestQueue(connection));
  console.log('eventQueue:', await market.loadEventQueue(connection));

  console.log('matchOrders', await market.matchOrders(connection, owner, 10));

  console.log('fills:', await market.loadFills(connection));

  if (openOrdersAccounts.length > 0) {
    console.log(
      'settleFunds',
      await market.settleFunds(
        connection,
        owner,
        openOrdersAccounts[0],
        baseTokenAccounts[0].pubkey,
        quoteTokenAccounts[0].pubkey,
      ),
    );
  }
}

send().catch((e) => console.warn(e));
