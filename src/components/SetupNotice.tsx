export default function SetupNotice() {
  return (
    <div className="mx-auto max-w-2xl p-8">
      <div className="card p-6">
        <h1 className="text-xl font-bold text-slate-900">LabFix: Firebase not configured</h1>
        <p className="mt-2 text-sm text-slate-600">
          Copy <code className="rounded bg-slate-100 px-1">.env.example</code> to{' '}
          <code className="rounded bg-slate-100 px-1">.env</code> and fill in your Firebase web app config
          (Firebase Console → Project settings → Your apps), then restart <code>npm run dev</code>.
        </p>
        <pre className="mt-4 overflow-x-auto rounded-lg bg-slate-900 p-4 text-xs text-slate-100">
{`VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project
VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...`}
        </pre>
        <p className="mt-4 text-sm text-slate-600">See README.md for full setup steps.</p>
      </div>
    </div>
  )
}
