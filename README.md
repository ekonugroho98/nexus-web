# 🤖 Nexus Bot - Automated Proof Generation

Bot otomatis untuk menjalankan task Nexus dan generate proof secara parallel dengan multi-thread support.

## 📋 Table of Contents

- [Features](#-features)
- [Prerequisites](#-prerequisites)
- [Installation](#-installation)
- [Configuration](#-configuration)
- [Usage](#-usage)
- [Multi-Thread Support](#-multi-thread-support)
- [Error Handling](#-error-handling)
- [Troubleshooting](#-troubleshooting)
- [File Structure](#-file-structure)
- [Contributing](#-contributing)

## ✨ Features

- **🔄 Multi-Thread Support**: Jalankan multiple akun bersamaan
- **💾 JWT Caching**: Cache JWT token untuk login yang lebih cepat
- **🛡️ Smart Retry**: Retry logic untuk handle rate limit dan proof errors
- **📊 Progress Tracking**: Real-time progress monitoring
- **🎯 Points Claiming**: Auto claim points setiap N loop
- **🌐 Proxy Support**: Support untuk proxy/VPN
- **📝 Comprehensive Logging**: Detailed logging untuk debugging

## 🔧 Prerequisites

- **Node.js** (v16 atau lebih baru)
- **npm** atau **yarn**
- **Private Key** dari Nexus account
- **Node ID** dari Nexus account

## 📦 Installation

1. **Clone repository**
```bash
git clone <repository-url>
cd nexus-bot
```

2. **Install dependencies**
```bash
npm install
```

3. **Setup environment**
```bash
cp env.example .env
# Edit .env file dengan konfigurasi yang sesuai
```

## ⚙️ Configuration

### 1. Account Setup

Buat file `accounts.txt` dengan format:
```
nodeId1,privateKey1
nodeId2,privateKey2
nodeId3,privateKey3
```

**Contoh:**
```
AKUN001,sk1abc123def456ghi789jkl012mno345pqr678stu901vwx234yz567
AKUN002,sk2def456ghi789jkl012mno345pqr678stu901vwx234yz567abc123
```

### 2. Proxy Setup (Optional)

Buat file `proxy.txt` dengan format:
```
http://proxy1:port
http://proxy2:port
socks5://proxy3:port
```

### 3. Environment Variables

Buat file `.env`:
```env
# Other configurations
NEXUS_API_URL=https://beta.orchestrator.nexus.xyz
```

## 🚀 Usage

### Basic Usage

```bash
node nexus-bot.js
```

### Interactive Mode

Bot akan menanyakan konfigurasi secara interaktif:

1. **Loop Count**: Berapa kali loop (0 = infinite)
2. **Delay**: Delay antar loop dalam detik
3. **Claim Frequency**: Setiap berapa loop melakukan claim (0 = tidak claim)

### Example Output

```
🚀 [MULTI-THREAD] Starting 3 accounts in parallel...

🔐 [AKUN #1] === LOGIN PROCESS ===
🔐 [AKUN #1] Node ID: AKUN001
🔐 [AKUN #1] ✅ Using cached JWT (no login needed)

🔄 [AKUN #1] === LOOP #1 START ===
📡 [AKUN #1] === STEP 1: REQUESTING TASK ===
📡 [AKUN #1] ✅ Task received successfully!
🔬 [AKUN #1] === STEP 3: GENERATING PROOF ===
🔬 [AKUN #1] ✅ Proof generated successfully!
📤 [AKUN #1] === STEP 4: SUBMITTING PROOF ===
📤 [AKUN #1] ✅ Proof submitted successfully!

📊 [MULTI-THREAD] === FINAL SUMMARY ===
📊 [MULTI-THREAD] Total accounts: 3
📊 [MULTI-THREAD] Successful: 3
📊 [MULTI-THREAD] Failed: 0
```

## 🔄 Multi-Thread Support

### Benefits

- **⚡ Speed**: Semua akun berjalan bersamaan
- **🔄 Efficiency**: Tidak ada delay antar akun
- **📈 Scalability**: Handle banyak akun tanpa bottleneck
- **📊 Monitoring**: Real-time progress tracking

### How It Works

1. **Parallel Execution**: Semua akun start bersamaan
2. **Independent Processing**: Setiap akun handle error sendiri
3. **Final Summary**: Menampilkan hasil semua akun

## 🛡️ Error Handling

### Rate Limit (429)
- **Strategy**: Exponential backoff (10s → 30s → 60s)
- **Retry**: Lanjut ke loop berikutnya

### Proof Verification Failed (422)
- **Strategy**: Retry dari awal dengan task baru
- **Reason**: Proof tidak valid atau task expired
- **Delay**: 5 detik sebelum retry

### Other Errors
- **Strategy**: Continue ke loop berikutnya
- **Logging**: Detailed error information

## 🔧 Troubleshooting

### Common Issues

#### 1. Login Failed (401)
```
❌ Authentication failed - check private key
```
**Solution**: Pastikan private key valid dan format benar

#### 2. Rate Limit (429)
```
❌ Rate limit detected! (First attempt)
⏳ Waiting 10 seconds before retry...
```
**Solution**: Bot akan auto retry dengan exponential backoff

#### 3. Proof Verification Failed (422)
```
❌ Proof submission failed!
🔄 Strategy: Retry from beginning (new task)
```
**Solution**: Bot akan request task baru dan retry

#### 4. Cloudflare Protection
```
🛡️ Cloudflare protection detected!
🛡️ Solutions:
🛡️ - Use different proxy/VPN
🛡️ - Wait longer between requests
🛡️ - Try different IP address
```
**Solution**: Gunakan proxy atau VPN yang berbeda

### Debug Mode

Untuk debugging, cek file log atau tambahkan console.log:

```javascript
// Di nexus-bot.js
console.log('DEBUG:', someVariable);
```

## 📁 File Structure

```
nexus/
├── nexus-bot.js    # Main bot file
├── processTask.js           # Task processing logic
├── login-util.js           # Login utilities
├── accounts.txt            # Account credentials
├── proxy.txt              # Proxy list (optional)
├── jwt_cache.json         # JWT cache (auto-generated)
├── .env                   # Environment variables
├── .gitignore            # Git ignore rules
└── README.md             # This file
```

## 🔐 Security

### Sensitive Files (Auto-ignored)
- `accounts.txt` - Account credentials
- `privatekey.txt` - Private keys
- `proxy.txt` - Proxy settings
- `.env` - Environment variables
- `jwt_cache.json` - JWT cache

### Best Practices
1. **Never commit sensitive files**
2. **Use environment variables for secrets**
3. **Rotate private keys regularly**
4. **Use secure proxies**

## 📊 Performance Tips

### Optimization
1. **Use multiple proxies** untuk distribusi load
2. **Adjust delay** berdasarkan rate limit
3. **Monitor JWT cache** untuk login yang lebih cepat
4. **Use SSD storage** untuk cache files

### Monitoring
- **Rate limit counter**: Track rate limit occurrences
- **Success rate**: Monitor successful vs failed operations
- **Cache hit rate**: Monitor JWT cache effectiveness

## 🤝 Contributing

### How to Contribute
1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open Pull Request

### Code Style
- Use meaningful variable names
- Add comprehensive comments
- Follow error handling best practices
- Include proper logging

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## ⚠️ Disclaimer

This bot is for educational purposes only. Use at your own risk and in accordance with Nexus terms of service.

## 🆘 Support

### Getting Help
1. Check [Troubleshooting](#-troubleshooting) section
2. Review error logs
3. Check Nexus API status
4. Verify account credentials

### Reporting Issues
When reporting issues, please include:
- Error message
- Account configuration (without sensitive data)
- Bot version
- Node.js version
- Operating system

---

**Made with ❤️ for the Nexus community** 