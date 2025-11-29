const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

// 创建示例数据库
function createSampleDatabase() {
  const dbPath = path.join(__dirname, '..', 'sample-audio.db');
  
  // 如果数据库已存在，删除它
  if (fs.existsSync(dbPath)) {
    fs.unlinkSync(dbPath);
  }

  const db = new sqlite3.Database(dbPath);

  console.log('🗄️ 创建示例数据库...');

  db.serialize(() => {
    // 创建音频文件表
    db.run(`
      CREATE TABLE audio_files (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        file_path TEXT NOT NULL,
        file_name TEXT NOT NULL,
        file_size INTEGER DEFAULT 0,
        duration REAL DEFAULT 0,
        format TEXT DEFAULT 'unknown',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 插入示例数据
    const sampleFiles = [
      {
        path: '/Users/sample/Music/song1.mp3',
        name: 'song1.mp3',
        size: 5242880,
        duration: 180.5,
        format: 'mp3'
      },
      {
        path: '/Users/sample/Music/song2.wav',
        name: 'song2.wav',
        size: 45000000,
        duration: 240.2,
        format: 'wav'
      },
      {
        path: '/Users/sample/Music/song3.flac',
        name: 'song3.flac',
        size: 35000000,
        duration: 195.8,
        format: 'flac'
      },
      {
        path: '/Users/sample/Audio/podcast1.m4a',
        name: 'podcast1.m4a',
        size: 25000000,
        duration: 1800.0,
        format: 'm4a'
      },
      {
        path: '/Users/sample/Audio/audiobook.aac',
        name: 'audiobook.aac',
        size: 120000000,
        duration: 3600.0,
        format: 'aac'
      }
    ];

    const stmt = db.prepare(`
      INSERT INTO audio_files (file_path, file_name, file_size, duration, format)
      VALUES (?, ?, ?, ?, ?)
    `);

    sampleFiles.forEach(file => {
      stmt.run(file.path, file.name, file.size, file.duration, file.format);
    });

    stmt.finalize();

    console.log(`✅ 示例数据库创建完成: ${dbPath}`);
    console.log(`📊 插入了 ${sampleFiles.length} 条示例记录`);
    console.log('💡 你可以在应用中使用这个数据库进行测试');
  });

  db.close();
}

// 如果直接运行此脚本
if (require.main === module) {
  createSampleDatabase();
}

module.exports = { createSampleDatabase };