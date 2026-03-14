const mongoose = require('mongoose');
const User = require('./backend/models/User');

mongoose.connect('mongodb+srv://salesforgeadmin:YfM1Bq3Wf1n9yI6u@sales-forge-crm.n0u7e.mongodb.net/salesforge?retryWrites=true&w=majority&appName=sales-forge-crm')
    .then(async () => {
        console.log('Connected. Resetting vault fields...');
        await User.updateMany({}, {
            $unset: { vaultPassword: 1, vaultSecurityQuestion: 1, vaultSecurityAnswer: 1 },
            $set: { hasVaultPassword: false }
        });
        console.log('Vault reset for all users.');
        process.exit(0);
    })
    .catch(err => {
        console.error(err);
        process.exit(1);
    });
