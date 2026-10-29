import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/auth.config";

export async function verifyAdmin() {
    try {
        const session = await getServerSession(authOptions);
        if (!session || !session.user) return false;

        const user = session.user as any;
        const isUserAdmin = 
            user.role === 'admin' || 
            user.isAdmin === true || 
            user.id === process.env.ADMIN_RECEIVER_ID;
        
        return !!isUserAdmin;
    } catch (err) {
        console.error("Admin verification error:", err);
        return false;
    }
}