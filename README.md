[![npm (scoped)](https://img.shields.io/npm/v/@project-serum/serum)](https://www.npmjs.com/package/@project-serum/serum)
[![Build Status](https://travis-ci.com/project-serum/serum-js.svg?branch=master)](https://travis-ci.com/project-serum/serum-js)

# Serum JS Client Library

JavaScript client library for interacting with the Project Serum DEX.

## Installation

Using npm:

```
npm install @solana/web3.js @project-serum/serum
```

Using yarn:

```
yarn add @solana/web3.js @project-serum/serum
```

# Guide

This guide will cover every aspect of Serum-JS and how it can be used to interact with the Serum DEX. For a technical introduction to the Serum DEX, please take a look at: https://docs.google.com/document/d/1isGJES4jzQutI0GtQGuqtrBUqeHxl_xJNXdtOv4SdII

## Retrieving market data

Loading a market

```js
import { Market } from '@project-serum/serum';
import { Connection, PublicKey } from '@solana/web3.js';

let MARKET_ADDRESS = '';
let MARKET_PROGRAM_ID = '';
let endpoint = {
  name: 'mainnet-beta',
  endpoint: 'https://solana-api.projectserum.com',
};
let connection = new Connection(endpoint, 'recent');
Market market = await Market.load(connection, MARKET_ADDRESS, {}, MARKET_PROGRAM_ID);

// the owner of the market
PublicKey programId = market.programId();
// the address of the market
PublicKey address = market.address();
// the mint address of the base token
PublicKey baseMintAddress = market.baseMintAddress();
// the mint address of the quote token
PublicKey quoteMintAddress = market.quoteMintAddress();
```

Getting the orderbook

```js
// Fetching orderbooks
let bids = await market.loadBids(connection);
let asks = await market.loadAsks(connection);
// L2 orderbook data
for (let [price, size] of bids.getL2(20)) {
  console.log(price, size);
}
// Full orderbook data
for (let order of asks) {
  console.log(
    order.orderId,
    order.price,
    order.size,
    order.side, // 'buy' or 'sell'
  );
}
```

Retrieving open orders by owner

```js
let orders = await market.loadOrdersForOwner(connection, wallet.publicKey);
// orders data
for (let order of orders) {
  console.log(
    order.orderId,
    order.price,
    order.size,
    order.side, // 'buy' or 'sell'
  );
}
```

Get BASE and QUOTE token accounts for market and owner

```js
// Array<{ pubkey: PublicKey; account: AccountInfo<Buffer> }>
let baseTokenAccounts = await market.findBaseTokenAccountsForOwner(
  connection,
  wallet.publicKey,
);
// Array<{ pubkey: PublicKey; account: AccountInfo<Buffer> }>
let quoteTokenAccounts = await market.findQuoteTokenAccountsForOwner(
  connection,
  wallet.publicKey,
);
```

Get open order accounts for market and owner

```js
let openOrdersAccounts = await market.findOpenOrdersAccountsForOwner(
  connection,
  wallet.publicKey,
);
```

Get all open order accounts for owner

```js
import { OpenOrders } from '@project-serum/serum';
import { PublicKey } from '@solana/web3.js';
let ownerPublicKey = new PublicKey('...'); // your public key

let programId = new PublicKey('...');
let openOrdersAccounts = await OpenOrders.findForOwner(
  connection,
  wallet.publicKey,
  programId,
);
```

## Interacting with the DEX

To interact with the DEX, a Wallet adapter is needed: https://github.com/project-serum/sol-wallet-adapter.
This library will act as mediary between the frond-end and the Wallet, allowing dApps to use third-party wallets to sign transactions.

### Install

`npm install --save sol-wallet-adapter`

### Usage

```js
import Wallet from '@project-serum/sol-wallet-adapter';
let endpoint = {
  name: 'mainnet-beta',
  endpoint: 'https://solana-api.projectserum.com',
};
let providerUrl = 'https://www.sollet.io'; // wallet provider
let wallet = useMemo(() => new Wallet(providerUrl, endpoint), [
  providerUrl,
  endpoint,
]);
```

Interacting with the DEX is done by creating a transaction which is then send onto the Solana blockchain.
Follow the instructions below on how to create and send transations.

### Sending a transaction

```js
// see examples below on how to create a transaction
async function sendTransaction(transaction, signers = [wallet.publicKey]) {
  let { blockhash } = await connection.getRecentBlockhash();
  transaction.recentBlockhash = blockhash;
  transaction.signPartial(...signers);

  let signed = await wallet.signTransaction(transaction);
  let txid = await connection.sendRawTransaction(signed.serialize());
  await connection.confirmTransaction(txid);
}
```

### Creating a new order transaction

New order and cancellation requests make it onto the request queue. To process this queue, match order instructions are needed.
For more info: https://docs.google.com/document/d/1isGJES4jzQutI0GtQGuqtrBUqeHxl_xJNXdtOv4SdII

```js
let baseTokenAccounts = await market.findBaseTokenAccountsForOwner(
  connection,
  wallet.publicKey,
);
let baseTokenAccount = baseTokenAccounts && baseTokenAccounts[0];

let quoteTokenAccounts = await market.findQuoteTokenAccountsForOwner(
  connection,
  wallet.publicKey,
);
let quoteTokenAccount = quoteTokenAccounts && quoteTokenAccounts[0];

/*
 ** Owner: wallet.publicKey
 ** Payer: side === 'sell' ? baseTokenAccount : quoteTokenAccount
 ** Side: 'sell' or 'buy'
 ** Order Type: 'ioc', 'postOnly' or 'limit'
 */
let params = {
  owner,
  payer,
  side,
  price,
  size,
  orderType,
};

let transaction = market.makeMatchOrdersTransaction(5);
let {
  transaction: placeOrderTx,
  signers,
} = await market.makePlaceOrderTransaction(connection, params);
transaction.add(placeOrderTx);
transaction.add(market.makeMatchOrdersTransaction(5));
```

### Creating a cancel order transaction

```js
let orders = await market.loadOrdersForOwner(connection, wallet.publicKey);
let order = orders && orders[0];

let transaction = market.makeMatchOrdersTransaction(5);
transaction.add(
  market.makeCancelOrderInstruction(connection, wallet.publicKey, order),
);
transaction.add(market.makeMatchOrdersTransaction(5));
let signers = [wallet.publicKey];
```

### Creating a settle funds transaction

```js
let openOrdersAccounts = await market.findOpenOrdersAccountsForOwner(
  connection,
  wallet.publicKey,
);
let openOrders = openOrdersAccounts && openOrdersAccounts[0];

let baseTokenAccounts = await market.findBaseTokenAccountsForOwner(
  connection,
  wallet.publicKey,
);
let baseTokenAccount = baseTokenAccounts && baseTokenAccounts[0];

let quoteTokenAccounts = await market.findQuoteTokenAccountsForOwner(
  connection,
  wallet.publicKey,
);
let quoteTokenAccount = quoteTokenAccounts && quoteTokenAccounts[0];

let { transaction, signers } = await market.makeSettleFundsTransaction(
  connection,
  openOrders,
  baseTokenAccount.pubkey,
  quoteTokenAccount.pubkey,
);
```

### Create SOL token transfer transaction

```js
import { SystemProgram, PublicKey } from '@solana/web3.js';

let destination = new PublicKey('...');
let transaction = SystemProgram.transfer({
  fromPubkey: wallet.publicKey,
  toPubkey: destination,
  lamports: amount,
});
let signers = [wallet.publicKey];
```

### Create SPL token transfer transaction

```js
import { TokenInstructions } from '@project-serum/serum';
import { SystemProgram, PublicKey } from '@solana/web3.js';

let source = new PublicKey('...'); // token account address
let destination = new PublicKey('...');
let transaction = new Transaction().add(
  TokenInstructions.transfer({
    source,
    destination,
    owner: wallet.publicKey,
    amount,
  }),
);
let signers = [wallet.publicKey];
```

### Create token accounts

```js
import { TokenInstructions } from '@project-serum/serum';
import { SystemProgram } from '@solana/web3.js';

let mint = new PublicKey('...'); // token mint address

const newAccount = new Account();
const transaction = SystemProgram.createAccount({
  fromPubkey: wallet.publicKey,
  newAccountPubkey: newAccount.publicKey,
  lamports: await connection.getMinimumBalanceForRentExemption(165),
  space: 165,
  programId: TokenInstructions.TOKEN_PROGRAM_ID,
});
transaction.add(
  TokenInstructions.initializeAccount({
    account: newAccount.publicKey,
    mint,
    owner: wallet.publicKey,
  }),
);
let signers = [newAccount, wallet.publicKey];
```
