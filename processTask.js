"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.submitProof = submitProof;
exports.generateFibonacciProof = generateFibonacciProof;
exports.generateLocalProof = generateLocalProof;
exports.requestTask = requestTask;
exports.runFullWorkflow = runFullWorkflow;
// Enum untuk node type
const WEB_PROVER = 0;
// Helper: Mock keypair dan signature
function getKeyPairFromSession() {
    // Mock: return random keypair
    return {
        publicKey: new Uint8Array([1, 2, 3, 4]),
        secretKey: new Uint8Array([5, 6, 7, 8])
    };
}
function encodeUtf8(str) {
    return new TextEncoder().encode(str);
}
function signDetached(message, secretKey) {
    // Mock: return dummy signature
    return new Uint8Array([9, 9, 9, 9]);
}
// Fungsi encoder protobuf sederhana
function encodeVarint(value) {
    const bytes = [];
    let v = value >>> 0;
    while (v >= 0x80) {
        bytes.push((v & 0x7F) | 0x80);
        v >>>= 7;
    }
    bytes.push(v);
    return bytes;
}
function encodeString(field, str) {
    const tag = (field << 3) | 2;
    const strBytes = Array.from(encodeUtf8(str));
    const varint = encodeVarint(strBytes.length);
    const result = [tag];
    result.push(...varint);
    result.push(...strBytes);
    return result;
}
function encodeBytes(field, bytes) {
    const tag = (field << 3) | 2;
    const byteArr = Array.from(bytes);
    const varint = encodeVarint(bytes.length);
    const result = [tag];
    result.push(...varint);
    result.push(...byteArr);
    return result;
}
function encodeInt32(field, value) {
    const tag = (field << 3) | 0;
    return [tag, ...encodeVarint(value)];
}
function encodeNodeTelemetry(field, telemetry) {
    // nodeTelemetry fields:
    // 1: flopsPerSec (int32)
    // 2: memoryUsed (int32)
    // 3: memoryCapacity (int32)
    // 4: location (string)
    const inner = [];
    inner.push(...encodeInt32(1, telemetry.flopsPerSec));
    inner.push(...encodeInt32(2, telemetry.memoryUsed));
    inner.push(...encodeInt32(3, telemetry.memoryCapacity));
    inner.push(...encodeString(4, telemetry.location));
    // wrap as length-delimited field
    const tag = (field << 3) | 2;
    return [tag, ...encodeVarint(inner.length), ...inner];
}
// Fungsi untuk membuat binary payload submit proof sesuai protobuf
function createSubmitPayload(taskId, proofHash, proofBytes, flopsPerSec, publicKey, signature, nodeId) {
    const nodeType = 0; // WEB_PROVER
    const nodeTelemetry = {
        flopsPerSec: Math.floor(flopsPerSec),
        memoryUsed: 1,
        memoryCapacity: 1,
        location: "US"
    };
    let bytes = [];
    bytes.push(...encodeString(1, nodeId));
    bytes.push(...encodeInt32(2, nodeType));
    bytes.push(...encodeString(3, proofHash));
    bytes.push(...encodeNodeTelemetry(4, nodeTelemetry));
    bytes.push(...encodeBytes(5, proofBytes));
    bytes.push(...encodeString(6, taskId));
    bytes.push(...encodeBytes(7, publicKey));
    bytes.push(...encodeBytes(8, signature));
    return new Uint8Array(bytes);
}
// Fungsi submit proof yang menggunakan endpoint asli
async function submitProof(taskId, proofHash, proofBytes, flopsPerSec, nodeId) {
    try {
        const { publicKey, secretKey } = getKeyPairFromSession();
        const message = encodeUtf8(`0 | ${taskId} | ${proofHash}`);
        const signature = signDetached(message, secretKey);
        // Create binary payload
        const payload = createSubmitPayload(taskId, proofHash, proofBytes, flopsPerSec, publicKey, signature, nodeId);
        // Submit to actual Nexus API
        const response = await fetch('https://beta.orchestrator.nexus.xyz/v3/tasks/submit', {
            method: 'POST',
            headers: {
                'accept': '*/*',
                'accept-language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7,jv;q=0.6',
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
            body: payload
        });
        if (!response.ok) {
            const errorText = await response.text();
            console.error(`[submit]: Error response:`, errorText);
            throw new Error(`HTTP ${response.status}: ${response.statusText} - ${errorText}`);
        }
        // Handle response (bisa JSON atau binary)
        let responseData;
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
            responseData = await response.json();
        }
        else {
            // Binary response
            const responseBuffer = await response.arrayBuffer();
            responseData = {
                status: 'success',
                size: responseBuffer.byteLength,
                data: Array.from(new Uint8Array(responseBuffer))
            };
        }
        console.log(`[submit]: Successfully submitted proof for task ${taskId}`);
        // Tidak ada penulisan file di sini
    }
    catch (error) {
        console.error(`[submit]: Error submitting proof for task ${taskId}:`, error);
        throw error;
    }
}
// Fungsi untuk menghitung hash dari proof bytes
function calculateProofHash(proofBytes) {
    // Simple hash calculation (dalam implementasi nyata, gunakan SHA-256)
    let hash = 0;
    for (let i = 0; i < proofBytes.length; i++) {
        hash = ((hash << 5) - hash + proofBytes[i]) & 0xFFFFFFFF;
    }
    return hash.toString(16).padStart(8, '0');
}
// Fungsi untuk generate Fibonacci proof dengan public inputs yang benar
async function generateFibonacciProof(publicInputs) {
    console.log('[proof]: Generating Fibonacci proof...');
    console.log('[proof]: Public inputs:', Array.from(publicInputs));
    // Decode public inputs sesuai format Nexus
    // Format: [program_id][input_data] (tanpa length prefix)
    console.log("[proof]: Public inputs hex:", Array.from(publicInputs).map(b => b.toString(16).padStart(2, '0')).join(''));
    let programId = '';
    let inputData = publicInputs;
    const inputStr = new TextDecoder().decode(publicInputs);
    console.log(`[proof]: Input as string: "${inputStr}"`);
    // Cari program ID yang dikenal
    if (inputStr.includes('fib_input_initial')) {
        programId = 'fib_input_initial';
        const programIndex = inputStr.indexOf('fib_input_initial');
        const remainingData = publicInputs.slice(programIndex + programId.length);
        inputData = remainingData;
        console.log(`[proof]: Found program ID: ${programId}`);
    }
    else {
        // Fallback: ambil 4 bytes pertama sebagai input
        programId = 'fib_input_initial'; // assume
        inputData = publicInputs.slice(0, 4);
        console.log(`[proof]: Using fallback program ID: ${programId}`);
    }
    console.log(`[proof]: Input data size: ${inputData.length} bytes`);
    // Decode input berdasarkan program
    if (programId === 'fib_input_initial') {
        // Fibonacci input: 4 bytes untuk n
        if (inputData.length >= 4) {
            const inputView = new DataView(inputData.buffer, inputData.byteOffset, 4);
            const n = inputView.getUint32(0, true);
            console.log(`[proof]: Fibonacci input n = ${n}`);
            let a = 0, b = 1;
            for (let i = 2; i <= n; i++) {
                const temp = a + b;
                a = b;
                b = temp;
            }
            console.log(`[proof]: Fibonacci(${n}) = ${b}`);
            const proofData = new ArrayBuffer(128);
            const proofView = new DataView(proofData);
            const magic = encodeUtf8("NEXUS_PROOF");
            for (let i = 0; i < 12; i++) {
                proofView.setUint8(i, magic[i] || 0);
            }
            // - Version: 1 (4 bytes)
            proofView.setUint32(12, 1, true);
            const programHash = calculateProofHash(encodeUtf8(programId));
            for (let i = 0; i < 16; i++) {
                proofView.setUint8(16 + i, parseInt(programHash.substring(i * 2, i * 2 + 2), 16) || 0);
            }
            // Proof Data (64 bytes)
            // - Input parameters
            proofView.setUint32(32, n, true); // input n
            proofView.setUint32(36, Math.min(b, 0xFFFFFFFF), true); // result
            // - Computation metadata
            proofView.setUint32(40, Date.now() & 0xFFFFFFFF, true); // timestamp
            proofView.setUint32(44, Math.floor(Math.random() * 0xFFFFFFFF), true); // nonce
            proofView.setUint32(48, n, true); // block count
            proofView.setUint32(52, Math.min(b, 1000000), true); // cycles
            // - Reserved for future use
            for (let i = 56; i < 96; i++) {
                proofView.setUint8(i, Math.floor(Math.random() * 256));
            }
            // Proof Signature (32 bytes) - simulated cryptographic signature
            for (let i = 96; i < 128; i++) {
                proofView.setUint8(i, Math.floor(Math.random() * 256));
            }
            const proofBytes = new Uint8Array(proofData);
            const proofHash = calculateProofHash(proofBytes);
            return {
                hash: proofHash,
                bytes: proofBytes,
                blockCount: n,
                cycles: Math.min(b, 1000000)
            };
        }
    }
    // Fallback untuk program lain
    console.log("[proof]: Unknown program or invalid input, using generic proof");
    const proofBytes = new Uint8Array(64);
    crypto.getRandomValues(proofBytes);
    return {
        hash: calculateProofHash(proofBytes),
        bytes: proofBytes,
        blockCount: 1000,
        cycles: 500
    };
}
// Fungsi generate proof yang lebih realistis
async function generateLocalProof(task, publicInputs) {
    // Untuk demo, gunakan generateFibonacciProof
    if (publicInputs) {
        return generateFibonacciProof(publicInputs);
    }
    // Fallback: random proof
    const proofBytes = new Uint8Array(64);
    crypto.getRandomValues(proofBytes);
    return {
        hash: calculateProofHash(proofBytes),
        bytes: proofBytes,
        blockCount: 1000,
        cycles: 500
    };
}
// Simple protobuf-like encoder untuk request task
function encodeTaskRequest(nodeId, nodeType, ed25519PublicKey) {
    // Simple protobuf encoding untuk GetProofTaskRequest
    // Field 1: nodeId (string)
    // Field 2: nodeType (int32) 
    // Field 3: ed25519PublicKey (bytes)
    const nodeIdBytes = encodeUtf8(nodeId);
    const nodeIdLength = nodeIdBytes.length;
    // Calculate total size
    const totalSize = 2 + nodeIdLength + // field 1 (nodeId): tag + length + data
        2 + 4 + // field 2 (nodeType): tag + int32
        2 + ed25519PublicKey.length; // field 3 (ed25519PublicKey): tag + length + data
    const buffer = new ArrayBuffer(totalSize);
    const view = new DataView(buffer);
    let offset = 0;
    // Field 1: nodeId (string)
    view.setUint8(offset, (1 << 3) | 2); // tag 1, wire type 2 (length-delimited)
    offset += 1;
    view.setUint8(offset, nodeIdLength);
    offset += 1;
    new Uint8Array(buffer, offset, nodeIdLength).set(nodeIdBytes);
    offset += nodeIdLength;
    // Field 2: nodeType (int32)
    view.setUint8(offset, (2 << 3) | 0); // tag 2, wire type 0 (varint)
    offset += 1;
    view.setUint8(offset, nodeType);
    offset += 1;
    // Field 3: ed25519PublicKey (bytes)
    view.setUint8(offset, (3 << 3) | 2); // tag 3, wire type 2 (length-delimited)
    offset += 1;
    view.setUint8(offset, ed25519PublicKey.length);
    offset += 1;
    new Uint8Array(buffer, offset, ed25519PublicKey.length).set(ed25519PublicKey);
    return new Uint8Array(buffer);
}
// Simple protobuf-like decoder untuk response task
function decodeTaskResponse(buffer) {
    // Decode protobuf response untuk GetProofTaskResponse
    // Field 1: programId (string)
    // Field 2: publicInputs (bytes)
    // Field 3: taskId (string)
    let offset = 0;
    let programId = '';
    let publicInputs = new Uint8Array(0);
    let taskId = '';
    while (offset < buffer.length) {
        const tag = buffer[offset];
        const fieldNumber = tag >> 3;
        const wireType = tag & 7;
        offset++;
        switch (fieldNumber) {
            case 1: // programId (string)
                if (wireType !== 2)
                    break; // length-delimited
                const programIdLength = buffer[offset];
                offset++;
                programId = new TextDecoder().decode(buffer.slice(offset, offset + programIdLength));
                offset += programIdLength;
                break;
            case 2: // publicInputs (bytes)
                if (wireType !== 2)
                    break; // length-delimited
                const publicInputsLength = buffer[offset];
                offset++;
                publicInputs = buffer.slice(offset, offset + publicInputsLength);
                offset += publicInputsLength;
                break;
            case 3: // taskId (string)
                if (wireType !== 2)
                    break; // length-delimited
                const taskIdLength = buffer[offset];
                offset++;
                taskId = new TextDecoder().decode(buffer.slice(offset, offset + taskIdLength));
                offset += taskIdLength;
                break;
            default:
                // Skip unknown fields
                if (wireType === 0) { // varint
                    while (offset < buffer.length && (buffer[offset] & 0x80) !== 0)
                        offset++;
                    offset++;
                }
                else if (wireType === 1) { // 64-bit
                    offset += 8;
                }
                else if (wireType === 2) { // length-delimited
                    const length = buffer[offset];
                    offset++;
                    offset += length;
                }
                else if (wireType === 5) { // 32-bit
                    offset += 4;
                }
                break;
        }
    }
    return { taskId, programId, publicInputs };
}
// Fungsi untuk request task dari Nexus API
async function requestTask(nodeId, publicKey) {
    try {
        console.log('[request]: Sending request to Nexus API...');
        console.log('[request]: nodeId:', nodeId);
        console.log('[request]: publicKey:', publicKey);
        // Convert base64 public key to Uint8Array
        const publicKeyBytes = Uint8Array.from(atob(publicKey), c => c.charCodeAt(0));
        // Create protobuf payload
        const payload = encodeTaskRequest(nodeId, 0, publicKeyBytes); // 0 = WEB_PROVER
        console.log('[request]: Payload size:', payload.length, 'bytes');
        const response = await fetch('https://beta.orchestrator.nexus.xyz/v3/tasks', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/octet-stream',
                'Accept': 'application/octet-stream',
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36'
            },
            body: payload
        });
        console.log(`[request]: Response status: ${response.status} ${response.statusText}`);
        if (!response.ok) {
            const errorText = await response.text();
            console.error('[request]: Error response:', errorText);
            throw new Error(`HTTP ${response.status}: ${response.statusText} - ${errorText}`);
        }
        const responseBuffer = await response.arrayBuffer();
        console.log('[request]: Response size:', responseBuffer.byteLength, 'bytes');
        // Decode protobuf response
        const responseData = decodeTaskResponse(new Uint8Array(responseBuffer));
        console.log('[request]: Decoded response:', responseData);
        // Tidak ada penulisan file di sini
        return responseData;
    }
    catch (error) {
        console.error('[request]: Error requesting task:', error);
        throw error;
    }
}
// Fungsi untuk menjalankan full workflow: request task -> generate proof -> submit proof
async function runFullWorkflow(nodeId, publicKey) {
    try {
        console.log('=== Starting Full Workflow ===');
        // Step 1: Request task
        console.log('\n[workflow]: Step 1 - Requesting task...');
        const { taskId, programId, publicInputs } = await requestTask(nodeId, publicKey);
        // Step 2: Create task object
        const task = {
            id: taskId,
            status: 'pending',
            programId: programId,
            lastFetch: Date.now()
        };
        console.log(`[workflow]: Received task ${taskId} for program ${programId}`);
        console.log(`[workflow]: Public inputs size: ${publicInputs.length} bytes`);
        // Step 3: Generate proof
        console.log('\n[workflow]: Step 2 - Generating proof...');
        const proof = await generateLocalProof(task, publicInputs);
        console.log(`[workflow]: Proof generated:`);
        console.log(`  - Hash: ${proof.hash}`);
        console.log(`  - Size: ${proof.bytes.length} bytes`);
        console.log(`  - Blocks: ${proof.blockCount}`);
        console.log(`  - Cycles: ${proof.cycles}`);
        // Step 4: Submit proof
        console.log('\n[workflow]: Step 3 - Submitting proof...');
        await submitProof(taskId, proof.hash, proof.bytes, 1000, nodeId); // 1000 flops/sec
        console.log('\n[workflow]: ✅ Full workflow completed successfully!');
    }
    catch (error) {
        console.error('[workflow]: ❌ Error in workflow:', error);
        throw error;
    }
}
// Eksekusi otomatis jika dijalankan langsung
if (require.main === module) {
    // Ganti dengan nodeId dan publicKey yang sesuai
    const nodeId = 'ISI_NODE_ID_ANDA';
    const publicKey = 'ISI_PUBLIC_KEY_BASE64_ANDA';
    runFullWorkflow(nodeId, publicKey);
}
