const mongoose = require('mongoose');
const User = require('./models/User'); // relative to backend dir

// We use the URI from the backend server.js to connect
const MONGODB_URI = 'mongodb+srv://salesforgeadmin:YfM1Bq3Wf1n9yI6u@sales-forge-crm.n0u7e.mongodb.net/salesforge?retryWrites=true&w=majority&appName=sales-forge-crm';

mongoose.connect(MONGODB_URI)
    .then(async () => {
        console.log('Connected to MongoDB.');
        try {
            const result = await User.updateMany({}, {
                $unset: { vaultPassword: 1, vaultSecurityQuestion: 1, vaultSecurityAnswer: 1 },
                $set: { hasVaultPassword: false }
            });
            console.log(`Vault reset successfully. Cleaned ${result.modifiedCount} user profiles.`);
        } catch (e) {
            console.error('Update error:', e);
        }
        process.exit(0);
    })
    .catch(err => {
        console.error('Connection Error:', err);
        process.exit(1);
    });
