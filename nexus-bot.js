const fs = require('fs');
const axios = require('axios');

const { ProxyAgent } = require('proxy-agent');

const { getJwtWithPrivateKey } = require('./login-util');
const imported = require('./processTask.js');
console.log('DEBUG imported:', imported);
const { requestTask, generateLocalProof, submitProof } = imported;
const readline = require('readline');
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

// Helper: Simulasi delay
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// JWT Cache Management
const JWT_CACHE_FILE = 'jwt_cache.json';
const JWT_EXPIRY_BUFFER = 5 * 60 * 1000; // 5 menit buffer sebelum expiry

function loadJwtCache() {
  try {
    if (fs.existsSync(JWT_CACHE_FILE)) {
      const cache = JSON.parse(fs.readFileSync(JWT_CACHE_FILE, 'utf-8'));
      console.log(`📁 Loaded JWT cache with ${Object.keys(cache).length} entries`);
      return cache;
    }
  } catch (error) {
    console.log(`⚠️  Error loading JWT cache: ${error.message}`);
  }
  return {};
}

function saveJwtCache(cache) {
  try {
    fs.writeFileSync(JWT_CACHE_FILE, JSON.stringify(cache, null, 2));
    console.log(`💾 JWT cache saved successfully`);
  } catch (error) {
    console.log(`⚠️  Error saving JWT cache: ${error.message}`);
  }
}

function isJwtExpired(jwt) {
  try {
    // Decode JWT payload (base64 decode the second part)
    const parts = jwt.split('.');
    if (parts.length !== 3) return true;
    
    const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
    const expiryTime = payload.exp * 1000; // Convert to milliseconds
    const currentTime = Date.now();
    
    // Check if JWT is expired (with buffer time)
    return currentTime >= (expiryTime - JWT_EXPIRY_BUFFER);
  } catch (error) {
    console.log(`⚠️  Error checking JWT expiry: ${error.message}`);
    return true; // Assume expired if can't decode
  }
}

function getJwtExpiryTime(jwt) {
  try {
    const parts = jwt.split('.');
    if (parts.length !== 3) return null;
    
    const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
    return new Date(payload.exp * 1000);
  } catch (error) {
    return null;
  }
}

async function getCachedJwt(nodeId, privateKey) {
  const cache = loadJwtCache();
  const cacheKey = `${nodeId}_${privateKey.substring(0, 20)}`;
  
  if (cache[cacheKey]) {
    const { jwt, timestamp } = cache[cacheKey];
    console.log(`🔍 [JWT CACHE] Found cached JWT for ${nodeId}`);
    console.log(`🔍 [JWT CACHE] Cached at: ${new Date(timestamp).toLocaleString()}`);
    
    if (!isJwtExpired(jwt)) {
      const expiryTime = getJwtExpiryTime(jwt);
      console.log(`🔍 [JWT CACHE] JWT valid until: ${expiryTime?.toLocaleString() || 'Unknown'}`);
      console.log(`🔍 [JWT CACHE] ✅ Using cached JWT`);
      return jwt;
    } else {
      console.log(`🔍 [JWT CACHE] ❌ Cached JWT expired, will fetch new one`);
      delete cache[cacheKey];
      saveJwtCache(cache);
    }
  } else {
    console.log(`🔍 [JWT CACHE] No cached JWT found for ${nodeId}`);
  }
  
  return null;
}

async function saveJwtToCache(nodeId, privateKey, jwt) {
  const cache = loadJwtCache();
  const cacheKey = `${nodeId}_${privateKey.substring(0, 20)}`;
  
  cache[cacheKey] = {
    jwt,
    timestamp: Date.now()
  };
  
  const expiryTime = getJwtExpiryTime(jwt);
  console.log(`💾 [JWT CACHE] Saving JWT to cache`);
  console.log(`💾 [JWT CACHE] Expires at: ${expiryTime?.toLocaleString() || 'Unknown'}`);
  
  saveJwtCache(cache);
}

function cleanExpiredJwtCache() {
  const cache = loadJwtCache();
  const originalCount = Object.keys(cache).length;
  let cleanedCount = 0;
  
  for (const [key, entry] of Object.entries(cache)) {
    if (isJwtExpired(entry.jwt)) {
      delete cache[key];
      cleanedCount++;
    }
  }
  
  if (cleanedCount > 0) {
    console.log(`🧹 [JWT CACHE] Cleaned ${cleanedCount} expired JWT entries`);
    saveJwtCache(cache);
  } else {
    console.log(`🧹 [JWT CACHE] No expired JWT entries to clean`);
  }
  
  const remainingCount = Object.keys(cache).length;
  console.log(`🧹 [JWT CACHE] Cache status: ${remainingCount}/${originalCount} entries remaining`);
}

function readAccountsFromFile(path = 'accounts.txt') {
  return fs.readFileSync(path, 'utf-8')
    .split('\n')
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('#'))
    .map(line => {
      const [nodeId, privateKey] = line.split(',').map(s => s.trim());
      return { nodeId, privateKey };
    });
}

function readProxiesFromFile(path = 'proxy.txt') {
  return fs.existsSync(path)
    ? fs.readFileSync(path, 'utf-8')
      .split('\n')
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('#'))
    : [];
}

function ask(question) {
  return new Promise(resolve => rl.question(question, ans => resolve(ans.trim())));
}

async function getInteractiveConfig() {
  const nodeId = await ask('Masukkan nodeId: ');
  const privateKey = await ask('Masukkan privateKey: ');
  const proxy = await ask('Masukkan proxy (boleh kosong): ');
  const loopNum = parseInt(await ask('Berapa kali loop? (0 = infinite): '), 10) || 0;
  const delaySec = parseInt(await ask('Delay antar loop (detik): '), 10) || 60;
  rl.close();
  return { nodeId, privateKey, proxy, loopNum, delaySec };
}

// === KONFIGURASI NON-INTERAKTIF ===
const loopNum = 5; // 0 = infinite
const delaySec = 60; // detik


// Function to handle Cloudflare challenges with anti-captcha
async function handleCloudflareChallenge(response, originalRequest, akunId) {
  try {
    console.log(`🛡️ [AKUN #${akunId}] === CLOUDFLARE CHALLENGE DETECTED ===`);
    console.log(`🛡️ [AKUN #${akunId}] Status Code: ${response.status}`);
    console.log(`🛡️ [AKUN #${akunId}] Response Headers:`, response.headers);
    
    // Check if we have anti-captcha API key
    if (!process.env.CAPTCHA_API_KEY || process.env.CAPTCHA_API_KEY === 'YOUR_2CAPTCHA_API_KEY') {
      console.log(`🛡️ [AKUN #${akunId}] ❌ No valid anti-captcha API key configured`);
      console.log(`🛡️ [AKUN #${akunId}] Please set CAPTCHA_API_KEY environment variable`);
      throw new Error('Anti-captcha API key not configured');
    }
    
    // Extract sitekey from response
    const siteKey = cloudflareSolver.extractSiteKey(response);
    if (!siteKey) {
      console.log(`🛡️ [AKUN #${akunId}] ❌ Could not extract sitekey from Cloudflare challenge`);
      throw new Error('Could not extract Cloudflare sitekey');
    }
    
    console.log(`🛡️ [AKUN #${akunId}] 🔍 Extracted sitekey: ${siteKey}`);
    console.log(`🛡️ [AKUN #${akunId}] 🚀 Starting anti-captcha solving...`);
    
    // Solve the challenge using anti-captcha API
    const token = await cloudflareSolver.solveCloudflareChallenge(siteKey, originalRequest.url);
    
    console.log(`🛡️ [AKUN #${akunId}] ✅ Anti-captcha solution received`);
    console.log(`🛡️ [AKUN #${akunId}] 🚀 Retrying request with solution...`);
    
    // Retry the original request with the solution
    const solvedResponse = await cloudflareSolver.solveWithToken(token, originalRequest);
    
    console.log(`🛡️ [AKUN #${akunId}] ✅ Cloudflare challenge solved successfully!`);
    console.log(`🛡️ [AKUN #${akunId}] Status: ${solvedResponse.status}`);
    
    return solvedResponse;
    
  } catch (error) {
    console.log(`🛡️ [AKUN #${akunId}] ❌ Failed to solve Cloudflare challenge:`, error.message);
    throw error;
  }
}

// Enhanced request function with Cloudflare handling
async function makeRequestWithCloudflareHandling(requestConfig, akunId) {
  try {
    console.log(`📡 [AKUN #${akunId}] 🚀 Making request to: ${requestConfig.url}`);
    console.log(`📡 [AKUN #${akunId}] Method: ${requestConfig.method}`);
    console.log(`📡 [AKUN #${akunId}] Headers:`, Object.keys(requestConfig.headers || {}));
    
    const response = await axios(requestConfig);
    
    console.log(`📡 [AKUN #${akunId}] ✅ Request successful!`);
    console.log(`📡 [AKUN #${akunId}] Status: ${response.status}`);
    
    return response;
    
  } catch (error) {
    if (error.response) {
      const response = error.response;
      
      // Check if it's a Cloudflare challenge
      if (cloudflareSolver.isCloudflareChallenge(response)) {
        console.log(`🛡️ [AKUN #${akunId}] 🛡️ Cloudflare challenge detected!`);
        return await handleCloudflareChallenge(response, requestConfig, akunId);
      }
    }
    
    // Re-throw if not a Cloudflare challenge or if solving failed
    throw error;
  }
}

async function runWorkflow(loopNum, delayMs, jwt, nodeId, akunId = 1, proxy = null, claimEvery = 100) {
  let i = 1;
  let rateLimitCount = 0; // Counter untuk rate limit
  
  // === LOGGING SETUP ===
  console.log(`\n🔧 [AKUN #${akunId}] === WORKFLOW CONFIGURATION ===`);
  console.log(`🔧 [AKUN #${akunId}] Node ID: ${nodeId}`);
  console.log(`🔧 [AKUN #${akunId}] Loop Count: ${loopNum === 0 ? 'Infinite' : loopNum}`);
  console.log(`🔧 [AKUN #${akunId}] Delay per loop: ${delayMs / 1000} seconds`);
  console.log(`🔧 [AKUN #${akunId}] Claim every: ${claimEvery} loops`);
  console.log(`🔧 [AKUN #${akunId}] Proxy: ${proxy || 'None'}`);
  console.log(`🔧 [AKUN #${akunId}] JWT Token: ${jwt ? '✅ Valid' : '❌ Invalid'}`);
  console.log(`🔧 [AKUN #${akunId}] === CONFIGURATION COMPLETE ===\n`);
  
  let agent = undefined;
  if (proxy) {
    try {
      console.log(`🔧 [AKUN #${akunId}] Setting up proxy: ${proxy}`);
      agent = new ProxyAgent(proxy);
      console.log(`🔧 [AKUN #${akunId}] ✅ Proxy configured successfully`);
    } catch (error) {
      console.log(`🔧 [AKUN #${akunId}] ⚠️  Proxy error: ${error.message}, running without proxy`);
    }
  } else {
    console.log(`🔧 [AKUN #${akunId}] ℹ️  No proxy configured, using direct connection`);
  }
  
  while (loopNum === 0 || i <= loopNum) {
    // === LOOP START LOGGING ===
    console.log(`\n🔄 [AKUN #${akunId}] === LOOP #${i} START ===`);
    console.log(`🔄 [AKUN #${akunId}] Timestamp: ${new Date().toISOString()}`);
    console.log(`🔄 [AKUN #${akunId}] Rate limit count: ${rateLimitCount}`);
    
    // Progress indicator dan claim points setiap claimEvery loop
    if (claimEvery > 0 && i % claimEvery === 0) {
      console.log(`\n🎯 [AKUN #${akunId}] ==========================================`);
      console.log(`🎯 [AKUN #${akunId}] 🎯 PROGRESS: ${i} loops completed!`);
      console.log(`🎯 [AKUN #${akunId}] 🎯 ==========================================`);
      
      // Claim points
      try {
        console.log(`🎯 [AKUN #${akunId}] 💰 Starting points claim process...`);
        console.log(`🎯 [AKUN #${akunId}] 💰 Target URL: https://beta.orchestrator.nexus.xyz/v3/points/claim`);
        console.log(`🎯 [AKUN #${akunId}] 💰 Method: POST`);
        console.log(`🎯 [AKUN #${akunId}] 💰 Authorization: Bearer ${jwt.substring(0, 20)}...`);
        const claimResponse = await fetch('https://beta.orchestrator.nexus.xyz/v3/points/claim', {
          method: 'POST',
          headers: {
            'accept': '*/*',
            'accept-language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7,jv;q=0.6',
            'authorization': `Bearer ${jwt}`,
            'content-type': 'application/octet-stream',
            'origin': 'https://app.nexus.xyz',
            'priority': 'u=1, i',
            'referer': 'https://app.nexus.xyz/',
            'sec-ch-ua': '"Not)A;Brand";v="8", "Chromium";v="138", "Google Chrome";v="138"',
            'sec-ch-ua-mobile': '?0',
            'sec-ch-ua-platform': '"macOS"',
            'sec-fetch-dest': 'empty',
            'sec-fetch-mode': 'cors',
            'sec-fetch-site': 'same-site',
            'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36'
          },
          agent
        });
        

        
        console.log(`🎯 [AKUN #${akunId}] 💰 Claim response status: ${claimResponse.status} ${claimResponse.statusText}`);
        
        if (claimResponse.ok) {
          const raw = await claimResponse.text();
          console.log(`🎯 [AKUN #${akunId}] 💰 Response length: ${raw.length} characters`);
          try {
            const json = JSON.parse(raw);
            console.log(`🎯 [AKUN #${akunId}] 💰 ✅ Points claimed successfully!`);
            console.log(`🎯 [AKUN #${akunId}] 💰 Response data:`, JSON.stringify(json, null, 2));
          } catch {
            console.log(`🎯 [AKUN #${akunId}] 💰 ✅ Points claimed! (non-JSON response)`);
            console.log(`🎯 [AKUN #${akunId}] 💰 Raw response:`, raw);
          }
        } else {
          console.log(`🎯 [AKUN #${akunId}] ❌ Failed to claim points. Status: ${claimResponse.status}`);
          const errorText = await claimResponse.text();
          console.log(`🎯 [AKUN #${akunId}] ❌ Error details:`, errorText);
        }
      } catch (claimError) {
        console.log(`🎯 [AKUN #${akunId}] ❌ Error claiming points:`, claimError.message);
        console.log(`🎯 [AKUN #${akunId}] ❌ Error stack:`, claimError.stack);
      }
      
      console.log(`🎯 [AKUN #${akunId}] 🎯 ==========================================\n`);
    }
    console.log(`[AKUN #${akunId}] ==============================`);
    console.log(`[AKUN #${akunId}]   NEXUS BOT REAL CLI (RUN #${i}) [NodeId: ${nodeId}]`);
    console.log(`[AKUN #${akunId}] ==============================`);
    try {
      // === STEP 1: REQUEST TASK ===
      console.log(`\n📡 [AKUN #${akunId}] === STEP 1: REQUESTING TASK ===`);
      console.log(`📡 [AKUN #${akunId}] Target Node ID: ${nodeId}`);
      console.log(`📡 [AKUN #${akunId}] Public Key: XeiYk4ivBQ7ECxposDJmKtNtPC7mfkosgaYvo905eGc=`);
      console.log(`📡 [AKUN #${akunId}] Target URL: https://beta.orchestrator.nexus.xyz/v3/tasks`);
      console.log(`📡 [AKUN #${akunId}] Method: POST`);
      
      // Random delay 1-3 detik sebelum request
      const randomDelay = Math.floor(Math.random() * 3000) + 1000;
      console.log(`📡 [AKUN #${akunId}] ⏳ Random delay: ${randomDelay}ms`);
      await sleep(randomDelay);
      
      console.log(`📡 [AKUN #${akunId}] 🚀 Sending task request...`);
      const taskData = await requestTask(nodeId, "XeiYk4ivBQ7ECxposDJmKtNtPC7mfkosgaYvo905eGc=");
      
      if (!taskData || !taskData.taskId) {
        console.log(`📡 [AKUN #${akunId}] ❌ Invalid response:`, taskData);
        throw new Error('No taskId in response');
      }
      
      console.log(`📡 [AKUN #${akunId}] ✅ Task received successfully!`);
      console.log(`📡 [AKUN #${akunId}] Task ID: ${taskData.taskId}`);
      console.log(`📡 [AKUN #${akunId}] Program ID: ${taskData.programId}`);
      console.log(`📡 [AKUN #${akunId}] Public Inputs Size: ${taskData.publicInputs ? taskData.publicInputs.length : 0} bytes`);
      console.log(`📡 [AKUN #${akunId}] === STEP 1 COMPLETE ===\n`);
      await sleep(500);

      // === STEP 2: TASK STATUS UPDATES ===
      console.log(`📊 [AKUN #${akunId}] === STEP 2: TASK STATUS UPDATES ===`);
      console.log(`📊 [AKUN #${akunId}] Updating task status to 'fetched'...`);
      await sleep(300);
      console.log(`📊 [AKUN #${akunId}] ✅ Status updated to 'fetched'`);
      
      console.log(`📊 [AKUN #${akunId}] Updating task status to 'proving'...`);
      await sleep(300);
      console.log(`📊 [AKUN #${akunId}] ✅ Status updated to 'proving'`);
      console.log(`📊 [AKUN #${akunId}] === STEP 2 COMPLETE ===\n`);

      // === STEP 3: GENERATE PROOF ===
      console.log(`🔬 [AKUN #${akunId}] === STEP 3: GENERATING PROOF ===`);
      console.log(`🔬 [AKUN #${akunId}] Task ID: ${taskData.taskId}`);
      console.log(`🔬 [AKUN #${akunId}] Program ID: ${taskData.programId}`);
      console.log(`🔬 [AKUN #${akunId}] Public Inputs: ${taskData.publicInputs ? 'Available' : 'None'}`);
      
      const task = {
        id: taskData.taskId,
        status: 'pending',
        programId: taskData.programId,
        lastFetch: Date.now()
      };
      
      console.log(`🔬 [AKUN #${akunId}] 🚀 Starting proof generation...`);
      const proof = await generateLocalProof(task, taskData.publicInputs);
      
      console.log(`🔬 [AKUN #${akunId}] ✅ Proof generated successfully!`);
      console.log(`🔬 [AKUN #${akunId}] Proof Hash: ${proof.hash}`);
      console.log(`🔬 [AKUN #${akunId}] Proof Size: ${proof.bytes.length} bytes`);
      console.log(`🔬 [AKUN #${akunId}] Block Count: ${proof.blockCount}`);
      console.log(`🔬 [AKUN #${akunId}] Cycles: ${proof.cycles}`);
      console.log(`🔬 [AKUN #${akunId}] === STEP 3 COMPLETE ===\n`);
      await sleep(500);

      // === STEP 4: SUBMIT PROOF ===
      console.log(`📤 [AKUN #${akunId}] === STEP 4: SUBMITTING PROOF ===`);
      console.log(`📤 [AKUN #${akunId}] Task ID: ${taskData.taskId}`);
      console.log(`📤 [AKUN #${akunId}] Proof Hash: ${proof.hash}`);
      console.log(`📤 [AKUN #${akunId}] Proof Size: ${proof.bytes.length} bytes`);
      console.log(`📤 [AKUN #${akunId}] Target URL: https://beta.orchestrator.nexus.xyz/v3/tasks/submit`);
      console.log(`📤 [AKUN #${akunId}] Method: POST`);
      
      console.log(`📤 [AKUN #${akunId}] Updating task status to 'submitted'...`);
      await sleep(300);
      console.log(`📤 [AKUN #${akunId}] ✅ Status updated to 'submitted'`);
      
      console.log(`📤 [AKUN #${akunId}] ⏳ Waiting 2 seconds before submitting proof...`);
      await sleep(2000);
      
      console.log(`📤 [AKUN #${akunId}] 🚀 Submitting proof to Nexus API...`);
      await submitProof(taskData.taskId, proof.hash, proof.bytes, 1000);
      console.log(`📤 [AKUN #${akunId}] ✅ Proof submitted successfully!`);
      console.log(`📤 [AKUN #${akunId}] === STEP 4 COMPLETE ===\n`);
      await sleep(500);

      // === WORKFLOW COMPLETE ===
      console.log(`🎉 [AKUN #${akunId}] === WORKFLOW COMPLETE ===`);
      console.log(`🎉 [AKUN #${akunId}] All steps completed successfully!`);
      console.log(`🎉 [AKUN #${akunId}] Rate limit counter reset to 0`);
      rateLimitCount = 0; // Reset counter jika berhasil
    } catch (err) {
      console.log(`\n❌ [AKUN #${akunId}] === ERROR DETECTED ===`);
      console.log(`❌ [AKUN #${akunId}] Error Type: ${err.constructor.name}`);
      console.log(`❌ [AKUN #${akunId}] Error Message: ${err.message}`);
      console.log(`❌ [AKUN #${akunId}] Error Stack: ${err.stack}`);
      console.log(`❌ [AKUN #${akunId}] Current Rate Limit Count: ${rateLimitCount}`);
      
      // Cek apakah error adalah rate limit
      if (err.message.includes('429') || err.message.includes('Rate limit') || err.message.includes('Too Many Requests')) {
        rateLimitCount++;
        let backoffDelay;
        
        if (rateLimitCount === 1) {
          backoffDelay = 10; // 10 detik
          console.log(`❌ [AKUN #${akunId}] 🚫 Rate limit detected! (First attempt)`);
        } else if (rateLimitCount === 2) {
          backoffDelay = 30; // 30 detik
          console.log(`❌ [AKUN #${akunId}] 🚫 Rate limit detected! (Second attempt)`);
        } else {
          backoffDelay = 60; // 60 detik untuk rate limit ke-3+
          console.log(`❌ [AKUN #${akunId}] 🚫 Rate limit detected! (Third+ attempt)`);
        }
        
        console.log(`❌ [AKUN #${akunId}] ⏳ Waiting ${backoffDelay} seconds before retry...`);
        console.log(`❌ [AKUN #${akunId}] New rate limit count: ${rateLimitCount}`);
        await sleep(backoffDelay * 1000);
        console.log(`❌ [AKUN #${akunId}] === RETRYING AFTER DELAY ===\n`);
        continue; // Lanjut ke loop berikutnya tanpa increment i
      } else if (err.message.includes('422') || err.message.includes('Proof verification failed') || err.message.includes('Unprocessable Entity')) {
        // Proof submission failed - retry from beginning with new task
        console.log(`❌ [AKUN #${akunId}] 🔄 Proof submission failed!`);
        console.log(`❌ [AKUN #${akunId}] 🔄 Error: ${err.message}`);
        console.log(`❌ [AKUN #${akunId}] 🔄 Strategy: Retry from beginning (new task)`);
        console.log(`❌ [AKUN #${akunId}] 🔄 Reason: Proof verification failed, need fresh task`);
        
        // Reset rate limit counter for proof errors
        rateLimitCount = 0;
        
        // Short delay before retry
        const proofRetryDelay = 5; // 5 detik
        console.log(`❌ [AKUN #${akunId}] ⏳ Waiting ${proofRetryDelay} seconds before retry...`);
        await sleep(proofRetryDelay * 1000);
        console.log(`❌ [AKUN #${akunId}] === RETRYING WITH NEW TASK ===\n`);
        continue; // Lanjut ke loop berikutnya tanpa increment i
      } else {
        console.log(`❌ [AKUN #${akunId}] Non-rate-limit error, continuing to next loop...`);
      }
      console.log(`❌ [AKUN #${akunId}] === ERROR HANDLING COMPLETE ===\n`);
    }
    i++;
    if (loopNum === 0 || i <= loopNum) {
      console.log(`\n⏳ [AKUN #${akunId}] === LOOP #${i-1} COMPLETE ===`);
      console.log(`⏳ [AKUN #${akunId}] Next loop: #${i}`);
      console.log(`⏳ [AKUN #${akunId}] Waiting ${delayMs / 1000} seconds before next run...`);
      console.log(`⏳ [AKUN #${akunId}] Rate limit count: ${rateLimitCount}`);
      await sleep(delayMs);
      console.log(`⏳ [AKUN #${akunId}] === DELAY COMPLETE ===\n`);
    }
  }
  console.log(`\n🎉 [AKUN #${akunId}] === ALL WORKFLOWS FINISHED ===`);
  console.log(`🎉 [AKUN #${akunId}] Total loops completed: ${i-1}`);
  console.log(`🎉 [AKUN #${akunId}] Final rate limit count: ${rateLimitCount}`);
  console.log(`🎉 [AKUN #${akunId}] === ACCOUNT COMPLETE ===\n`);
}

async function main() {
  // Clean expired JWT cache at startup
  console.log(`\n🧹 [JWT CACHE] === CLEANING EXPIRED JWT CACHE ===`);
  cleanExpiredJwtCache();
  console.log(`🧹 [JWT CACHE] === CACHE CLEANUP COMPLETE ===\n`);
  
  // Tanya loop, delay, dan claimEvery secara interaktif
  const loopNum = parseInt(await ask('Berapa kali loop? (0 = infinite): '), 10) || 0;
  const delaySec = parseInt(await ask('Delay antar loop (detik): '), 10) || 60;
  const claimEvery = parseInt(await ask('Setiap berapa loop melakukan claim? (0 = tidak claim): '), 10) || 0;

  const accounts = readAccountsFromFile();
  const proxies = readProxiesFromFile();
  if (accounts.length === 0) {
    throw new Error('File accounts.txt kosong atau tidak ditemukan!');
  }
  console.log(`🔑 Menjalankan bot untuk ${accounts.length} akun (nodeId,privateKey)...\n`);

  // Jalankan akun secara parallel (multi-thread)
  console.log(`🚀 [MULTI-THREAD] Starting ${accounts.length} accounts in parallel...`);
  
  const accountPromises = accounts.map(async (account, idx) => {
    const { nodeId, privateKey } = account;
    const proxy = proxies[idx] || null;
    
    return new Promise(async (resolve) => {
      try {
        console.log(`\n🔐 [AKUN #${idx + 1}] === LOGIN PROCESS ===`);
        console.log(`🔐 [AKUN #${idx + 1}] Node ID: ${nodeId}`);
        console.log(`🔐 [AKUN #${idx + 1}] Private Key: ${privateKey.substring(0, 20)}...`);
        console.log(`🔐 [AKUN #${idx + 1}] Proxy: ${proxy || 'None'}`);
        
        // Check for cached JWT first
        console.log(`🔐 [AKUN #${idx + 1}] 🔍 Checking for cached JWT...`);
        let jwt = await getCachedJwt(nodeId, privateKey);
        
        if (jwt) {
          console.log(`🔐 [AKUN #${idx + 1}] ✅ Using cached JWT (no login needed)`);
          console.log(`🔐 [AKUN #${idx + 1}] JWT Token: ${jwt.substring(0, 50)}...`);
          console.log(`🔐 [AKUN #${idx + 1}] JWT Length: ${jwt.length} characters`);
          console.log(`🔐 [AKUN #${idx + 1}] === LOGIN COMPLETE (CACHED) ===\n`);
        } else {
          console.log(`🔐 [AKUN #${idx + 1}] 🚀 Starting login process...`);
          console.log(`🔐 [AKUN #${idx + 1}] Target URL: https://beta.orchestrator.nexus.xyz/v3/auth/login`);
          console.log(`🔐 [AKUN #${idx + 1}] Method: POST`);
          
          const loginResult = await getJwtWithPrivateKey(privateKey);
          
          if (!loginResult || !loginResult.jwt) {
            console.log(`🔐 [AKUN #${idx + 1}] ❌ Login failed: Invalid response`);
            throw new Error('Login failed: No JWT token received');
          }
          
          jwt = loginResult.jwt;
          console.log(`🔐 [AKUN #${idx + 1}] ✅ Login successful!`);
          console.log(`🔐 [AKUN #${idx + 1}] JWT Token: ${jwt.substring(0, 50)}...`);
          console.log(`🔐 [AKUN #${idx + 1}] JWT Length: ${jwt.length} characters`);
          
          // Save JWT to cache
          await saveJwtToCache(nodeId, privateKey, jwt);
          console.log(`🔐 [AKUN #${idx + 1}] === LOGIN COMPLETE (NEW) ===\n`);
        }
        
        await runWorkflow(loopNum, delaySec * 1000, jwt, nodeId, idx + 1, proxy, claimEvery);
        resolve({ success: true, accountId: idx + 1 });
        
      } catch (err) {
        console.log(`\n❌ [AKUN #${idx + 1}] === LOGIN ERROR ===`);
        console.log(`❌ [AKUN #${idx + 1}] Error Type: ${err.constructor.name}`);
        console.log(`❌ [AKUN #${idx + 1}] Error Message: ${err.message}`);
        console.log(`❌ [AKUN #${idx + 1}] Node ID: ${nodeId}`);
        console.log(`❌ [AKUN #${idx + 1}] Private Key: ${privateKey.substring(0, 20)}...`);
        
        if (err.name === 'AxiosError') {
          console.log(`❌ [AKUN #${idx + 1}] 📡 Axios HTTP Error`);
          console.log(`❌ [AKUN #${idx + 1}] Status Code: ${err.response?.status || 'Unknown'}`);
          console.log(`❌ [AKUN #${idx + 1}] Status Text: ${err.response?.statusText || 'Unknown'}`);
          
          // Check for Cloudflare protection
          const responseText = err.response?.data || '';
          if (responseText.includes('Cloudflare') || responseText.includes('Access denied') || responseText.includes('challenge')) {
            console.log(`❌ [AKUN #${idx + 1}] 🛡️  Cloudflare protection detected!`);
            console.log(`❌ [AKUN #${idx + 1}] 🛡️  This is a Cloudflare challenge/block`);
            console.log(`❌ [AKUN #${idx + 1}] 🛡️  Possible causes:`);
            console.log(`❌ [AKUN #${idx + 1}] 🛡️  - Rate limiting from Cloudflare`);
            console.log(`❌ [AKUN #${idx + 1}] 🛡️  - Bot detection by Cloudflare`);
            console.log(`❌ [AKUN #${idx + 1}] 🛡️  - IP address blocked`);
            console.log(`❌ [AKUN #${idx + 1}] 🛡️  - Geographic restrictions`);
            console.log(`❌ [AKUN #${idx + 1}] 🛡️  Solutions:`);
            console.log(`❌ [AKUN #${idx + 1}] 🛡️  - Use different proxy/VPN`);
            console.log(`❌ [AKUN #${idx + 1}] 🛡️  - Wait longer between requests`);
            console.log(`❌ [AKUN #${idx + 1}] 🛡️  - Try different IP address`);
          } else if (err.response?.status === 401) {
            console.log(`❌ [AKUN #${idx + 1}] 🔐 Authentication failed - check private key`);
          } else if (err.response?.status === 429) {
            console.log(`❌ [AKUN #${idx + 1}] 🚫 Rate limit during login`);
            console.log(`❌ [AKUN #${idx + 1}] Response: ${err.response?.data || 'No response data'}`);
          } else if (err.response?.status >= 500) {
            console.log(`❌ [AKUN #${idx + 1}] 🔧 Server error during login`);
          } else {
            console.log(`❌ [AKUN #${idx + 1}] 🔍 HTTP ${err.response?.status} error during login`);
          }
        } else if (err.message.includes('401') || err.message.includes('Unauthorized')) {
          console.log(`❌ [AKUN #${idx + 1}] 🔐 Authentication failed - check private key`);
        } else if (err.message.includes('429') || err.message.includes('Rate limit')) {
          console.log(`❌ [AKUN #${idx + 1}] 🚫 Rate limit during login`);
        } else if (err.message.includes('Network') || err.message.includes('fetch')) {
          console.log(`❌ [AKUN #${idx + 1}] 🌐 Network error during login`);
        } else {
          console.log(`❌ [AKUN #${idx + 1}] 🔍 Unknown login error`);
        }
        
        console.log(`❌ [AKUN #${idx + 1}] === LOGIN ERROR HANDLING COMPLETE ===\n`);
        resolve({ success: false, accountId: idx + 1, error: err.message });
      }
    });
  });
  
  // Wait for all accounts to complete
  console.log(`⏳ [MULTI-THREAD] Waiting for all ${accounts.length} accounts to complete...`);
  const results = await Promise.all(accountPromises);
  
  // Summary
  const successful = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;
  console.log(`\n📊 [MULTI-THREAD] === FINAL SUMMARY ===`);
  console.log(`📊 [MULTI-THREAD] Total accounts: ${accounts.length}`);
  console.log(`📊 [MULTI-THREAD] Successful: ${successful}`);
  console.log(`📊 [MULTI-THREAD] Failed: ${failed}`);
  console.log(`📊 [MULTI-THREAD] === SUMMARY COMPLETE ===\n`);
}

main(); 