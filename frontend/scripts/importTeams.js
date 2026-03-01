require('dotenv').config({ path: '../.env' }); // Load .env from root frontend dir
const fs = require('fs');
const csv = require('csv-parser');

const admin = require('firebase-admin');

// ---------------------------------------------------------
// 1. INITIALIZE FIREBASE ADMIN
// You must download `serviceAccountKey.json` from:
// Firebase Console -> Project Settings -> Service Accounts
// and place it in the same directory as this script.
// ---------------------------------------------------------
try {
  const serviceAccount = require('./serviceAccountKey.json');
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
} catch (e) {
  console.error("❌ ERR: Missing 'serviceAccountKey.json'. Please add it to the scripts folder.");
  process.exit(1);
}

const db = admin.firestore();
const auth = admin.auth();



// Helper: Generate an 8 character random unencrypted password
function generatePassword() {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%';
  let password = '';
  for(let i = 0; i < 8; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}

// Ensure the CSV path is correct
const inputCSV = 'unstop_data.csv'; // Place this in the scripts folder
const teamsData = {};

console.log('📖 Reading CSV Data...');

fs.createReadStream(inputCSV)
  .on('error', (err) => {
    console.error("❌ ERR: Missing 'unstop_data.csv'. Please add it to the scripts folder.");
    process.exit(1);
  })
  .pipe(csv())
  .on('data', (row) => {
    // Assuming CSV columns are named exactly like this. Adjust if Unstop outputs differently!
    const { teamName, email, hackeRankUrl, year, phoneNo, branch, isLeader } = row;
    
    // Clean string to avoid whitespace issues
    const cleanTeamName = teamName ? teamName.trim() : "Unknown Team";

    if (!teamsData[cleanTeamName]) {
      teamsData[cleanTeamName] = {
        teamName: cleanTeamName,
        members: [],
        leader: null
      };
    }

    const memberData = { 
      email: email?.trim(), 
      hackeRankUrl: hackeRankUrl?.trim(), 
      year: year?.trim(), 
      phoneNo: phoneNo?.trim(), 
      branch: branch?.trim(), 
      isLeader: String(isLeader).trim().toLowerCase() === 'true' 
    };
    
    teamsData[cleanTeamName].members.push(memberData);
    
    // Explicitly set leader if marked in CSV
    if (memberData.isLeader) {
      teamsData[cleanTeamName].leader = memberData;
    }
  })
  .on('end', async () => {
    console.log('✅ CSV Parsed. Validating and uploading teams...\n');
    
    for (const [teamName, teamInfo] of Object.entries(teamsData)) {
      try {
        // If nobody was explicitly marked as leader, fallback to the 1st person
        if (!teamInfo.leader && teamInfo.members.length > 0) {
          teamInfo.leader = teamInfo.members[0];
        }

        if (!teamInfo.leader || !teamInfo.leader.email) {
          console.log(`⚠️ Skipping team ${teamName}: No valid leader email.`);
          continue;
        }

        const leaderEmail = teamInfo.leader.email;
        const generatedPassword = generatePassword();
        
        console.log(`Processing Team: [${teamName}] | Leader: ${leaderEmail}`);

        // 1. Create Team Leader in Firebase Auth
        let leaderUser;
        try {
          leaderUser = await auth.createUser({
            email: leaderEmail,
            password: generatedPassword,
            displayName: teamName
          });
        } catch (authErr) {
          if (authErr.code === 'auth/email-already-exists') {
            console.log(`   💡 User ${leaderEmail} exists. Updating their password...`);
            leaderUser = await auth.getUserByEmail(leaderEmail);
            // We overwrite the password to ensure it matches the generated unencrypted one we email
            await auth.updateUser(leaderUser.uid, { password: generatedPassword });
          } else {
            throw authErr;
          }
        }
        const leaderId = leaderUser.uid;

        // 2. Insert all members into `users` table
        const teamMemberIds = [];
        
        for (const member of teamInfo.members) {
           const isCurrentLeader = (member.email === leaderEmail);
           // We assign auth id to the leader, and auto-generate firestore IDs for normal members
           let userId = isCurrentLeader ? leaderId : db.collection('users').doc().id;
           teamMemberIds.push(userId);
           
           await db.collection('users').doc(userId).set({
             userId: userId,
             email: member.email || '',
             hackeRankUrl: member.hackeRankUrl || '',
             year: member.year || '',
             phoneNo: member.phoneNo || '',
             branch: member.branch || ''
           });
        }

        // 3. Create Team Document
        const teamRef = db.collection('teams').doc();
        await teamRef.set({
          teamId: teamRef.id,
          teamName: teamName,
          teamMembersId: teamMemberIds,
          leaderId: leaderId,
          points: 0,
          password: generatedPassword // Requested: store unencrypted
        });

        console.log(`   ✅ Firestore data created for team [${teamName}]`);

        // Mailer logic removed (to be added later)
        console.log(`   📝 Password for ${leaderEmail} is: ${generatedPassword}`);

      } catch (err) {
        console.error(`   ❌ Error processing team [${teamName}]:`, err);
      }
    }
    console.log('\n🎉 Finished importing batch!');
  });
