const axios = require('axios');
const { ethers } = require('ethers');
const crypto = require('crypto');

const API_BASE = 'https://app.dynamicauth.com/api/v0/sdk/adc09cea-6194-4667-8be8-931cc28dacd2';

// Generate random device fingerprint
function generateDeviceFingerprint() {
  return crypto.randomBytes(16).toString('hex');
}

// Generate session keypair untuk setiap login
function generateSessionKeypair() {
  const sessionWallet = ethers.Wallet.createRandom();
  // Remove 0x prefix to match the working curl format
  const sessionPublicKey = sessionWallet.publicKey.replace('0x', '');
  
  console.log('[DynamicAuth] 🔑 Generated session keypair:');
  console.log('[DynamicAuth] 🔑 Original Public Key:', sessionWallet.publicKey);
  console.log('[DynamicAuth] 🔑 Session Public Key (formatted):', sessionPublicKey);
  console.log('[DynamicAuth] 🔑 Session Public Key Length:', sessionPublicKey.length);
  console.log('[DynamicAuth] 🔑 Expected Length: 66 (without 0x)');
  console.log('[DynamicAuth] 🔑 Length Match:', sessionPublicKey.length === 66 ? '✅ Yes' : '❌ No');
  
  return {
    sessionPublicKey: sessionPublicKey,
    sessionPrivateKey: sessionWallet.privateKey
  };
}

function getHeaders({ requestId, sessionPublicKey }) {
  const deviceFingerprint = generateDeviceFingerprint();
  
  console.log('[DynamicAuth] 📋 Building headers with:');
  console.log('[DynamicAuth] 📋 Request ID:', requestId);
  console.log('[DynamicAuth] 📋 Session Public Key:', sessionPublicKey);
  console.log('[DynamicAuth] 📋 Device Fingerprint:', deviceFingerprint);
  
  return {
    'accept': '*/*',
    'accept-language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7,jv;q=0.6',
    'content-type': 'application/json',
    'origin': 'https://app.nexus.xyz',
    'priority': 'u=1, i',
    'referer': 'https://app.nexus.xyz/',
    'sec-ch-ua': '"Not)A;Brand";v="8", "Chromium";v="138", "Google Chrome";v="138"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"macOS"',
    'sec-fetch-dest': 'empty',
    'sec-fetch-mode': 'cors',
    'sec-fetch-site': 'cross-site',
    'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
    'x-dyn-api-version': 'API/0.0.688',
    'x-dyn-device-fingerprint': deviceFingerprint,
    'x-dyn-is-global-wallet-popup': 'false',
    'x-dyn-request-id': requestId,
    'x-dyn-session-public-key': sessionPublicKey,
    'x-dyn-version': 'WalletKit/4.20.9'
  };
}

async function connectWallet(address, opts) {
  const body = {
    address: address,
    chain: 'EVM',
    provider: 'browserExtension',
    walletName: 'rabby',
    authMode: 'connect-and-sign'
  };
  
  // Add random delay to simulate human behavior
  const delay = Math.floor(Math.random() * 2000) + 1000; // 1-3 seconds
  await new Promise(resolve => setTimeout(resolve, delay));
  
  await axios.post(`${API_BASE}/connect`, body, { headers: getHeaders(opts) });
}

async function getNonce(opts) {
  // Add random delay to simulate human behavior
  const delay = Math.floor(Math.random() * 1500) + 500; // 0.5-2 seconds
  await new Promise(resolve => setTimeout(resolve, delay));
  
  const res = await axios.get(`${API_BASE}/nonce`, { headers: getHeaders(opts) });
  return res.data.nonce;
}

function buildMessageToSign({ address, nonce, issuedAt, requestId }) {
  return `app.nexus.xyz wants you to sign in with your Ethereum account:
${address}

Welcome to Nexus. Signing is the only way we can truly know that you are the owner of the wallet you are connecting. Signing is a safe, gas-less transaction that does not in any way give Nexus permission to perform any transactions with your wallet.

URI: https://app.nexus.xyz/
Version: 1
Chain ID: 3940
Nonce: ${nonce}
Issued At: ${issuedAt}
Request ID: ${requestId}`;
}

async function verifySignature({ signedMessage, messageToSign, publicWalletAddress, headerSessionPublicKey, bodySessionPublicKey, requestId }) {
  const body = {
    signedMessage,
    messageToSign,
    publicWalletAddress,
    chain: 'EVM',
    walletName: 'rabby',
    walletProvider: 'browserExtension',
    network: '3940',
    additionalWalletAddresses: [],
    sessionPublicKey: bodySessionPublicKey
  };
  
  // Add random delay to simulate human behavior
  const delay = Math.floor(Math.random() * 3000) + 2000; // 2-5 seconds
  await new Promise(resolve => setTimeout(resolve, delay));
  
  console.log('[DynamicAuth] 📤 Verify request body sessionPublicKey:', bodySessionPublicKey);
  
  const res = await axios.post(
    `${API_BASE}/verify`,
    body,
    { headers: getHeaders({ sessionPublicKey: headerSessionPublicKey, requestId }) } // Use header sessionPublicKey for header
  );
  return res.data;
}

async function getJwtWithPrivateKey(PRIVATE_KEY) {
  // Generate two different session keypairs - one for header, one for body
  const headerSessionWallet = ethers.Wallet.createRandom();
  const bodySessionWallet = ethers.Wallet.createRandom();
  
  const headerSessionPublicKey = headerSessionWallet.publicKey.replace('0x', '');
  const bodySessionPublicKey = bodySessionWallet.publicKey.replace('0x', '');
  
  const requestIdConnect = "reqid-connect-" + Date.now() + "-" + Math.random().toString(36).substr(2, 9);
  const requestIdNonce = "reqid-nonce-" + Date.now() + "-" + Math.random().toString(36).substr(2, 9);
  const requestIdVerify = "reqid-verify-" + Date.now() + "-" + Math.random().toString(36).substr(2, 9);
  const issuedAt = new Date().toISOString();
  const apiRequestId = 'adc09cea-6194-4667-8be8-931cc28dacd2';

  const wallet = new ethers.Wallet(PRIVATE_KEY);
  const address = await wallet.getAddress();

  console.log('[DynamicAuth] 🎯 Starting login process...');
  console.log('[DynamicAuth] 🎯 Wallet Address:', address);
  console.log('[DynamicAuth] 🎯 Header Session Public Key:', headerSessionPublicKey);
  console.log('[DynamicAuth] 🎯 Body Session Public Key:', bodySessionPublicKey);
  console.log('[DynamicAuth] 🎯 Request IDs:');
  console.log('[DynamicAuth] 🎯 - Connect:', requestIdConnect);
  console.log('[DynamicAuth] 🎯 - Nonce:', requestIdNonce);
  console.log('[DynamicAuth] 🎯 - Verify:', requestIdVerify);
  
  // Compare with working curl example
  console.log('[DynamicAuth] 🔍 Comparison with working curl:');
  console.log('[DynamicAuth] 🔍 Our header sessionPublicKey:', headerSessionPublicKey);
  console.log('[DynamicAuth] 🔍 Curl header sessionPublicKey: 03b8dc88d7a02631ab10617b6f945fc89b3bfe750d629bb749ee384971c157d0c1');
  console.log('[DynamicAuth] 🔍 Our body sessionPublicKey:', bodySessionPublicKey);
  console.log('[DynamicAuth] 🔍 Curl body sessionPublicKey: 03533f80cdc387011f5590de7a370827b196eaba26cd8e8f69e53105033aff89b9');
  console.log('[DynamicAuth] 🔍 Header Length match:', headerSessionPublicKey.length === 66 ? '✅ Yes' : '❌ No');
  console.log('[DynamicAuth] 🔍 Body Length match:', bodySessionPublicKey.length === 66 ? '✅ Yes' : '❌ No');

  try {
    // 1. Connect
    console.log('[DynamicAuth] Step 1: Connecting wallet...');
    await connectWallet(address, { sessionPublicKey: headerSessionPublicKey, requestId: requestIdConnect });
    
    // 2. Get Nonce
    console.log('[DynamicAuth] Step 2: Getting nonce...');
    const nonce = await getNonce({ sessionPublicKey: headerSessionPublicKey, requestId: requestIdNonce });
    
    // 3. Build message
    console.log('[DynamicAuth] Step 3: Building message to sign...');
    const messageToSign = buildMessageToSign({ address, nonce, issuedAt, requestId: apiRequestId });
    
    // 4. Sign
    console.log('[DynamicAuth] Step 4: Signing message...');
    const signedMessage = await wallet.signMessage(messageToSign);
    
    // 5. Verify
    console.log('[DynamicAuth] Step 5: Verifying signature...');
    const result = await verifySignature({
      signedMessage,
      messageToSign,
      publicWalletAddress: address,
      headerSessionPublicKey, // For header
      bodySessionPublicKey,   // For body
      requestId: requestIdVerify
    });
    
    console.log('[DynamicAuth] ✅ Login successful!');
    return result;
  } catch (error) {
    console.log('[DynamicAuth] ❌ Login failed:', error.message);
    if (error.response) {
      console.log('[DynamicAuth] Response status:', error.response.status);
      console.log('[DynamicAuth] Response data:', error.response.data);
    }
    throw error;
  }
}

module.exports = { getJwtWithPrivateKey }; 