const mongoose = require('mongoose');
require('dotenv').config({ path: './backend/.env' });
const User = require('./backend/models/User');

async function resetVaults() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB.');

        const result = await User.updateMany({}, {
            $unset: { vaultPassword: 1, vaultSecurityQuestion: 1, vaultSecurityAnswer: 1 },
            $set: { hasVaultPassword: false }
        });

        console.log(`Vault reset successfully. Cleaned ${result.modifiedCount} user profiles.`);
        process.exit(0);
    } catch (err) {
        console.error('Error:', err);
        process.exit(1);
    }
}

resetVaults();
