import { auth, db } from "./firebase";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { doc, setDoc, collection, addDoc, updateDoc } from "firebase/firestore";

interface UserProfile {
  email: string;
  hackeRankUrl: string;
  year: string;  // or number
  phoneNo: string;
  branch: string;
}

interface TeamData {
  teamName: string;
  password: string; // Storing as requested (not encrypted)
}

/**
 * Creates a team along with its leader's authentication and user profile.
 * 
 * Flow:
 * 1. Creates Firebase Auth user for the leader.
 * 2. Creates the leader's profile in the `users` collection.
 * 3. Creates the team document in the `teams` collection.
 */
export async function createTeamWithLeader(
  userProfile: UserProfile,
  teamData: TeamData
) {
  try {
    // 1. Create an auth account with leaderEmail and password
    const userCredential = await createUserWithEmailAndPassword(
      auth,
      userProfile.email,
      teamData.password
    );
    const leaderUser = userCredential.user;
    const leaderId = leaderUser.uid; // Firebase unique auth ID

    // 2. Create the user document in the `users` table/collection
    // We use the auth uid as the document ID for the user
    const userRef = doc(db, "users", leaderId);
    await setDoc(userRef, {
      userId: leaderId, // Storing the unique ID as requested
      email: userProfile.email,
      hackeRankUrl: userProfile.hackeRankUrl,
      year: userProfile.year,
      phoneNo: userProfile.phoneNo,
      branch: userProfile.branch,
    });

    // 3. Create the team document in the `teams` table/collection
    const teamsCollectionRef = collection(db, "teams");
    
    // addDoc will let Firebase automatically generate a unique ID for the team
    const teamDocRef = await addDoc(teamsCollectionRef, {
      teamName: teamData.teamName,
      teamMembersId: [leaderId], // Initially, the leader is the only member
      leaderId: leaderId,
      points: 0, // Initial points
      password: teamData.password, // Not encrypted, as requested
    });

    // Optional: Add the auto-generated teamId back into the team document
    await updateDoc(teamDocRef, {
      teamId: teamDocRef.id
    });

    console.log("Successfully created Team and Leader Profile!");
    
    return {
      success: true,
      leaderId: leaderId,
      teamId: teamDocRef.id,
    };
  } catch (error) {
    console.error("Error creating team and leader:", error);
    throw error;
  }
}
