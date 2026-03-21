const mongoose = require('mongoose');

const uri = "mongodb://kesharar215_db_user:Uto6OmjHDcNB6wza@cluster0-shard-00-00.ofi5sp1.mongodb.net:27017,cluster0-shard-00-01.ofi5sp1.mongodb.net:27017,cluster0-shard-00-02.ofi5sp1.mongodb.net:27017/?ssl=true&replicaSet=atlas-jfb4z9-shard-0&authSource=admin&retryWrites=true&w=majority&appName=Cluster0";

console.log('Testing standard URI...');
mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 })
  .then(() => {
    console.log('Connected successfully with standard URI!');
    process.exit(0);
  })
  .catch(err => {
    console.error('Failed standard connect:', err.message);
    process.exit(1);
  });
