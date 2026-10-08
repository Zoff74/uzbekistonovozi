const { MongoClient } = require('mongodb');

async function migrate() {
  const sourceClient = new MongoClient('mongodb://localhost:27017');
  const targetClient = new MongoClient('mongodb+srv://zoff74_db_user:OXVUzsAEZCp1IGc0@cluster0.xqcppys.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0');

  try {
    await sourceClient.connect();
    await targetClient.connect();

    const sourceDb = sourceClient.db('uzbekistonovozi');
    const targetDb = targetClient.db('uzbekistonovozi');

    // Все коллекции сайта + точные коллекции GridFS бакета "uploads"
    const collectionsToMove = [
      'users', 
      'videos', 
      'tracks', 
      'registrationlogs', 
      'categories', 
      'comments', 
      'posts',
      'uploads.files', 
      'uploads.chunks'
    ];

    for (let colName of collectionsToMove) {
      try {
        const data = await sourceDb.collection(colName).find({}).toArray();
        if (data.length > 0) {
          await targetDb.collection(colName).deleteMany({});
          await targetDb.collection(colName).insertMany(data);
          console.log(`✅ Успешно перенесено: ${colName} (${data.length} документов/чанков)`);
        }
      } catch (e) {
        console.log(`⚠️ Коллекция ${colName} пропущена или пуста.`);
      }
    }
    console.log('🚀 Перенос медиафайлов GridFS и базы данных завершен!');
  } finally {
    await sourceClient.close();
    await targetClient.close();
  }
}

migrate().catch(console.error);