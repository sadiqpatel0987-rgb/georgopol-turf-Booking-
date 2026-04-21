import React, { useState } from 'react';
import { auth, db } from './firebase';
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithPopup
} from 'firebase/auth';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { cn } from './lib/utils';
import { ShieldCheck, User, Phone, Mail, Lock, Globe } from 'lucide-react';

// Error Handling Spec
enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export default function AuthScreen() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleGoogleSignIn = async () => {
    setError('');
    setLoading(true);
    const provider = new GoogleAuthProvider();
    try {
      const result = await signInWithPopup(auth, provider);
      
      // Check if user exists in Firestore, if not create skeleton
      const userDoc = await getDoc(doc(db, 'users', result.user.uid));
      if (!userDoc.exists()) {
        await setDoc(doc(db, 'users', result.user.uid), {
          uid: result.user.uid,
          name: result.user.displayName || 'Google User',
          phone: result.user.phoneNumber || '',
          email: result.user.email,
          membership: 'NONE',
          createdAt: new Date().toISOString()
        });
      }
    } catch (err: any) {
      console.error("Full Google Auth Error Object:", JSON.stringify(err, null, 2));
      console.error("Google Auth Error Code:", err.code);
      console.error("Google Auth Error Message:", err.message);

      if (err.code === 'auth/internal-error') {
        setError('Firebase Internal Error. Check your console for details. Usually this is caused by: 1. Google Provider not enabled in Firebase Console. 2. Current domain not in Authorized Domains list. 3. Third-party cookies being blocked.');
      } else if (err.code === 'auth/operation-not-allowed') {
        setError('Google Sign-In is not enabled in the Firebase Console. Please go to Authentication > Sign-in method and enable Google.');
      } else if (err.code === 'auth/unauthorized-domain') {
        setError('This domain is not authorized for Firebase Auth. Please add it to the Authorized Domains list in the Firebase Console.');
      } else if (err.code === 'auth/popup-blocked') {
        setError('Login popup was blocked by your browser. Please allow popups for this site or click the "Open in new tab" icon (top right) to sign in there.');
      } else if (err.code === 'auth/popup-closed-by-user') {
        setError('Sign-in window was closed before completion. Please try again.');
      } else {
        setError(err.message || 'Google authentication failed');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (isLogin) {
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        const cred = await createUserWithEmailAndPassword(auth, email, password);
        try {
          await setDoc(doc(db, 'users', cred.user.uid), {
            uid: cred.user.uid,
            name,
            phone,
            email,
            membership: 'NONE',
            createdAt: new Date().toISOString()
          });
        } catch (dbError) {
           handleFirestoreError(dbError, OperationType.WRITE, `users/${cred.user.uid}`);
        }
      }
    } catch (err: any) {
      // Map generic Firebase auth errors into friendly messages
      if (err.code === 'auth/operation-not-allowed') {
        setError('Email/Password login is not enabled in Firebase Console. Please use Google Sign-In or enable it manually.');
        setLoading(false);
        return;
      }

      if (err.code === 'auth/invalid-credential' || err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password') {
        setError('Invalid email or password. Please try again or create a new account.');
        setLoading(false);
        return;
      }

      if (err.code === 'auth/email-already-in-use') {
        setError('An account with this email already exists. Please sign in instead.');
        setLoading(false);
        return;
      }
      
      if (err.code === 'auth/weak-password') {
        setError('Password should be at least 6 characters.');
        setLoading(false);
        return;
      }

      console.error("Authentication Error:", err);

      // If the error was generated by handleFirestoreError it's a JSON string.
      try {
        const parsedError = JSON.parse(err.message);
        setError("Database Permission Error: Make sure your Firebase Security Rules are correctly published.");
      } catch {
        setError(err.message || 'Authentication failed');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[100dvh] relative text-white font-sans flex items-center justify-center p-4 overflow-hidden">
      {/* Background Image & Overlay - Optimized for Fast Mobile Loading */}
      <div className="absolute inset-0 z-0 overflow-hidden bg-[#0A0F0B]">
        <picture>
          <source media="(max-width: 640px)" srcSet="https://images.unsplash.com/photo-1574629810360-7efbbe195018?q=60&w=800&auto=format,compress&fit=crop" />
          <img 
            src="https://images.unsplash.com/photo-1574629810360-7efbbe195018?q=80&w=2000&auto=format,compress&fit=crop" 
            alt="Stadium turf background" 
            className="w-full h-full object-cover object-center"
            decoding="async" 
            fetchPriority="high" 
          />
        </picture>
      </div>
      <div className="absolute inset-0 z-0 bg-black/70 shadow-[inset_0_0_150px_rgba(0,0,0,0.9)] backdrop-blur-[1px]" />

      <div className="relative z-10 max-w-md w-full glass-panel p-6 sm:p-10 shadow-2xl scale-[1.0] sm:scale-[1.02]">
        <div className="text-center mb-6 sm:mb-10">
          <h1 className="text-2xl sm:text-3xl font-black tracking-[3px] sm:tracking-[4px] text-neo-green mb-2">GEORGOPOL</h1>
          <p className="text-[9px] sm:text-[10px] tracking-[2px] sm:tracking-[3px] text-text-dim uppercase">Premium Turf Collective</p>
        </div>

        <div className="flex border-b border-white/10 mb-6 sm:mb-8">
          <button
            onClick={() => setIsLogin(true)}
            className={cn(
              "flex-1 py-3 sm:py-4 text-[11px] sm:text-[12px] font-bold uppercase tracking-widest transition-all",
              isLogin ? "text-neo-green border-b-2 border-neo-green" : "text-text-dim hover:text-white"
            )}
          >
            Sign In
          </button>
          <button
            onClick={() => setIsLogin(false)}
            className={cn(
              "flex-1 py-3 sm:py-4 text-[11px] sm:text-[12px] font-bold uppercase tracking-widest transition-all",
              !isLogin ? "text-neo-green border-b-2 border-neo-green" : "text-text-dim hover:text-white"
            )}
          >
            Create Account
          </button>
        </div>

        {error && (
          <div className="mb-6 p-4 border border-red-500/50 bg-red-500/10 text-red-500 text-sm font-bold text-center">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {!isLogin && (
            <>
              <div className="relative">
                <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-text-dim" />
                <input
                  type="text"
                  required
                  placeholder="FULL NAME"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  className="w-full bg-dark-bg border border-border-dim p-4 pl-12 text-[11px] uppercase tracking-widest outline-none focus:border-neo-green transition-all"
                />
              </div>
              <div className="relative">
                <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-text-dim" />
                <input
                  type="tel"
                  required
                  placeholder="PHONE NUMBER"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  className="w-full bg-dark-bg border border-border-dim p-4 pl-12 text-[11px] uppercase tracking-widest outline-none focus:border-neo-green transition-all"
                />
              </div>
            </>
          )}

          <div className="relative">
            <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-text-dim" />
            <input
              type="email"
              required
              placeholder="EMAIL ADDRESS"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full bg-dark-bg border border-border-dim p-4 pl-12 text-[11px] uppercase tracking-widest outline-none focus:border-neo-green transition-all"
            />
          </div>

          <div className="relative">
            <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-text-dim" />
            <input
              type="password"
              required
              placeholder="PASSWORD"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full bg-dark-bg border border-border-dim p-4 pl-12 text-[11px] uppercase tracking-widest outline-none focus:border-neo-green transition-all"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full mt-4 py-5 font-black uppercase tracking-[2px] text-sm bg-neo-green text-black hover:opacity-90 active:scale-[0.98] transition-all disabled:bg-border-dim disabled:text-text-dim"
          >
            {loading ? "Authenticating..." : (isLogin ? "Sign In Securely" : "Create Account")}
          </button>
        </form>

        <div className="mt-6">
          <div className="relative flex items-center justify-center mb-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border-dim"></div>
            </div>
            <span className="relative px-4 bg-card-bg text-[10px] text-text-dim uppercase tracking-widest">
              Or continue with
            </span>
          </div>

          <button
            onClick={handleGoogleSignIn}
            disabled={loading}
            className="w-full py-4 border border-border-dim bg-dark-bg text-white hover:border-neo-green transition-all flex items-center justify-center gap-3 text-[11px] font-bold uppercase tracking-widest disabled:opacity-50"
          >
            <Globe className="w-4 h-4 text-neo-green" />
            Connect with Google
          </button>
        </div>

        <div className="mt-8 flex items-center justify-center gap-2 text-text-dim text-[10px] uppercase tracking-widest">
          <ShieldCheck className="w-4 h-4 text-neo-green" />
          <span>Secured by Firebase</span>
        </div>
      </div>
    </div>
  );
}
