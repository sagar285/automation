// middleware.ts
import { NextRequest, NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';

// This config ensures the middleware only runs on specific paths
export const config = {
  matcher: ['/api/profile/:path*']
};

export async function middleware(req: NextRequest) {
  // Get authorization header
  const authHeader = req.headers.get('authorization');
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return NextResponse.json(
      { error: 'Unauthorized - Missing or invalid token format' },
      { status: 401 }
    );
  }

  // Extract token
  const token = authHeader.split(' ')[1];
  
  try {
    // Verify token (replace 'your_jwt_secret' with your actual secret from env)
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your_jwt_secret');
    
    // Create a new request with the user information attached
    const requestHeaders = new Headers(req.headers);
    requestHeaders.set('x-user-id', (decoded as any).userId);
    
    // Continue to the API route with the modified headers
    return NextResponse.next({
      request: {
        headers: requestHeaders,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Unauthorized - Invalid token' },
      { status: 401 }
    );
  }
}

// ---------------------------------------------------------
// app/api/profile/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { Pool } from 'pg';

// Initialize PostgreSQL connection pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Additional config options if needed
});

export async function GET(req: NextRequest) {
  try {
    // Get the user ID from the header set by middleware
    const userId = req.headers.get('x-user-id');
    
    if (!userId) {
      return NextResponse.json(
        { error: 'User ID not found' },
        { status: 400 }
      );
    }

    // Query the database for user profile
    const result = await pool.query(
      `SELECT id, name, email, bio, avatar_url, created_at 
       FROM users 
       WHERE id = $1`,
      [userId]
    );

    // Check if user exists
    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Return user profile data
    const user = result.rows[0];
    
    return NextResponse.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        bio: user.bio,
        avatarUrl: user.avatar_url,
        createdAt: user.created_at
      }
    }, { status: 200 });
    
  } catch (error) {
    console.error('Error fetching user profile:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}