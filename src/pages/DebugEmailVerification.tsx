import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ExternalLink, RefreshCw, Trash2, CheckCircle, XCircle, AlertCircle } from "lucide-react";

interface LogEntry {
  type: 'log' | 'error' | 'info';
  message: string;
  time: string;
}

// Section A: Current User State
const DebugUserInfo = () => {
  const [userInfo, setUserInfo] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const fetchUserInfo = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { data: { session } } = await supabase.auth.getSession();
      
      // Also fetch profile from database
      let profile = null;
      if (user?.id) {
        const { data } = await supabase
          .from('profiles')
          .select('*')
          .eq('user_id', user.id)
          .single();
        profile = data;
      }
      
      setUserInfo({ authUser: user, session, profile });
    } catch (err) {
      console.error('[DEBUG] Error fetching user info:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUserInfo();
  }, []);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Current User State</CardTitle>
          <Button variant="ghost" size="sm" onClick={fetchUserInfo} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : userInfo?.authUser ? (
          <>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">User ID:</span>
                <span className="font-mono text-xs">{userInfo.authUser.id}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Email:</span>
                <span className={userInfo.authUser.email ? '' : 'text-amber-600'}>{userInfo.authUser.email || 'None'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Email Confirmed:</span>
                <span className={userInfo.authUser.email_confirmed_at ? 'text-green-600' : 'text-red-600'}>
                  {userInfo.authUser.email_confirmed_at ? 'Yes' : 'No'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Phone:</span>
                <span>{userInfo.authUser.phone || 'None'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Phone Confirmed:</span>
                <span className={userInfo.authUser.phone_confirmed_at ? 'text-green-600' : 'text-amber-600'}>
                  {userInfo.authUser.phone_confirmed_at ? 'Yes' : 'N/A'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">New Email (pending):</span>
                <span className={userInfo.authUser.new_email ? 'text-amber-600' : 'text-muted-foreground'}>
                  {userInfo.authUser.new_email || 'None'}
                </span>
              </div>
            </div>
            <details className="mt-4">
              <summary className="text-xs text-muted-foreground cursor-pointer">Full Auth User JSON</summary>
              <pre className="text-xs bg-muted p-2 rounded mt-2 overflow-auto max-h-48">
                {JSON.stringify(userInfo.authUser, null, 2)}
              </pre>
            </details>
            <details>
              <summary className="text-xs text-muted-foreground cursor-pointer">Profile JSON</summary>
              <pre className="text-xs bg-muted p-2 rounded mt-2 overflow-auto max-h-48">
                {JSON.stringify(userInfo.profile, null, 2)}
              </pre>
            </details>
          </>
        ) : (
          <p className="text-sm text-red-600">No user logged in</p>
        )}
      </CardContent>
    </Card>
  );
};

// Section B: Test Email Update
const TestEmailUpdate = ({ onLog }: { onLog: (entry: LogEntry) => void }) => {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);

  const testUpdateEmail = async () => {
    setLoading(true);
    setResult(null);
    
    onLog({ type: 'info', message: `[TEST] Attempting to update email to: ${email}`, time: new Date().toISOString() });

    try {
      const { data, error } = await supabase.auth.updateUser({ email });
      
      onLog({ 
        type: error ? 'error' : 'log', 
        message: `[TEST] Update email response: ${JSON.stringify({ data: data?.user?.id ? 'User updated' : null, error: error?.message })}`, 
        time: new Date().toISOString() 
      });

      setResult({
        success: !error,
        data: data?.user ? { id: data.user.id, email: data.user.email, new_email: data.user.new_email } : null,
        error: error?.message,
        timestamp: new Date().toISOString()
      });
    } catch (err: any) {
      onLog({ type: 'error', message: `[TEST] Exception: ${err.message}`, time: new Date().toISOString() });
      setResult({
        success: false,
        error: err.message,
        timestamp: new Date().toISOString()
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">Test Email Update</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <Input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Enter test email"
        />
        <Button onClick={testUpdateEmail} disabled={loading || !email} className="w-full">
          {loading ? 'Testing...' : 'Test supabase.auth.updateUser({ email })'}
        </Button>
        
        {result && (
          <div className={`p-3 rounded text-sm ${result.success ? 'bg-green-100 dark:bg-green-900/30' : 'bg-red-100 dark:bg-red-900/30'}`}>
            <div className="flex items-center gap-2 font-semibold mb-2">
              {result.success ? <CheckCircle className="h-4 w-4 text-green-600" /> : <XCircle className="h-4 w-4 text-red-600" />}
              {result.success ? 'Success' : 'Error'}
            </div>
            <pre className="text-xs overflow-auto">{JSON.stringify(result, null, 2)}</pre>
          </div>
        )}
        
        <p className="text-xs text-muted-foreground">
          This calls <code>supabase.auth.updateUser(&#123; email &#125;)</code> which should trigger an email_change event.
        </p>
      </CardContent>
    </Card>
  );
};

// Section C: Test Resend Verification
const TestResendVerification = ({ onLog }: { onLog: (entry: LogEntry) => void }) => {
  const [email, setEmail] = useState('');
  const [resendType, setResendType] = useState<'signup' | 'email_change'>('email_change');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);

  const testResend = async () => {
    setLoading(true);
    setResult(null);
    
    onLog({ type: 'info', message: `[TEST] Attempting to resend (type: ${resendType}) to: ${email}`, time: new Date().toISOString() });

    try {
      const { data, error } = await supabase.auth.resend({
        type: resendType,
        email: email
      });
      
      onLog({ 
        type: error ? 'error' : 'log', 
        message: `[TEST] Resend response: ${JSON.stringify({ data, error: error?.message })}`, 
        time: new Date().toISOString() 
      });

      setResult({
        success: !error,
        data,
        error: error?.message,
        timestamp: new Date().toISOString()
      });
    } catch (err: any) {
      onLog({ type: 'error', message: `[TEST] Exception: ${err.message}`, time: new Date().toISOString() });
      setResult({
        success: false,
        error: err.message,
        timestamp: new Date().toISOString()
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">Test Resend Verification</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <Input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Enter email to resend to"
        />
        <div className="flex gap-2">
          <Button
            variant={resendType === 'email_change' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setResendType('email_change')}
          >
            email_change
          </Button>
          <Button
            variant={resendType === 'signup' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setResendType('signup')}
          >
            signup
          </Button>
        </div>
        <Button onClick={testResend} disabled={loading || !email} className="w-full" variant="secondary">
          {loading ? 'Sending...' : `Test supabase.auth.resend({ type: '${resendType}' })`}
        </Button>
        
        {result && (
          <div className={`p-3 rounded text-sm ${result.success ? 'bg-green-100 dark:bg-green-900/30' : 'bg-red-100 dark:bg-red-900/30'}`}>
            <div className="flex items-center gap-2 font-semibold mb-2">
              {result.success ? <CheckCircle className="h-4 w-4 text-green-600" /> : <XCircle className="h-4 w-4 text-red-600" />}
              {result.success ? 'Success' : 'Error'}
            </div>
            <pre className="text-xs overflow-auto">{JSON.stringify(result, null, 2)}</pre>
          </div>
        )}
        
        <p className="text-xs text-muted-foreground">
          Use <code>email_change</code> for phone users who added email. Use <code>signup</code> for email signups.
        </p>
      </CardContent>
    </Card>
  );
};

// Section D: Edge Function Logs Checklist
const CheckEdgeFunctionLogs = () => {
  return (
    <Card className="bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <AlertCircle className="h-5 w-5 text-amber-600" />
          Edge Function Logs Checklist
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <div>
          <p className="font-medium mb-2">To check if the edge function is being triggered:</p>
          <ol className="list-decimal ml-6 space-y-1 text-muted-foreground">
            <li>Open Supabase Dashboard</li>
            <li>Go to Edge Functions → send-auth-email</li>
            <li>Click on "Logs" tab</li>
            <li>Perform an action above (update email or resend)</li>
            <li>Refresh logs and look for recent entries</li>
          </ol>
        </div>
        
        <div className="p-3 bg-background rounded border">
          <p className="font-semibold mb-2">What to look for:</p>
          <ul className="space-y-1 text-muted-foreground">
            <li className="flex items-center gap-2"><CheckCircle className="h-3 w-3 text-green-600" /> Function is invoked (any log entries appear)</li>
            <li className="flex items-center gap-2"><CheckCircle className="h-3 w-3 text-green-600" /> Log shows: "Processing email_change for [email]"</li>
            <li className="flex items-center gap-2"><CheckCircle className="h-3 w-3 text-green-600" /> Recipient email is correct (not empty)</li>
            <li className="flex items-center gap-2"><XCircle className="h-3 w-3 text-red-600" /> Any error messages from Resend</li>
            <li className="flex items-center gap-2"><XCircle className="h-3 w-3 text-red-600" /> "Invalid `to` field" errors</li>
          </ul>
        </div>
        
        <Button asChild variant="default" className="w-full">
          <a 
            href="https://supabase.com/dashboard/project/mqbupmusmciijsjmzbcu/functions/send-auth-email/logs"
            target="_blank"
            rel="noopener noreferrer"
          >
            Open Edge Function Logs <ExternalLink className="h-4 w-4 ml-2" />
          </a>
        </Button>
      </CardContent>
    </Card>
  );
};

// Section E: Configuration Check
const ConfigurationCheck = () => {
  const [checks, setChecks] = useState<Record<string, any>>({});

  useEffect(() => {
    const runChecks = async () => {
      const results: Record<string, any> = {};
      
      results.supabaseClient = !!supabase;
      
      try {
        const { data } = await supabase.auth.getSession();
        results.hasSession = !!data?.session;
      } catch {
        results.hasSession = false;
      }
      
      results.environment = window.location.hostname;
      results.protocol = window.location.protocol;
      
      setChecks(results);
    };
    
    runChecks();
  }, []);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">Configuration Check</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1 text-sm">
          {Object.entries(checks).map(([key, value]) => (
            <div key={key} className="flex items-center gap-2">
              <span className={value ? 'text-green-600' : 'text-red-600'}>
                {value ? <CheckCircle className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
              </span>
              <span className="text-muted-foreground">{key}:</span>
              <span className="font-mono text-xs">{String(value)}</span>
            </div>
          ))}
        </div>
        
        <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded text-sm">
          <p className="font-semibold mb-2">Manual Checks Required:</p>
          <ul className="list-disc ml-6 space-y-1 text-muted-foreground">
            <li>Supabase Auth → Email provider enabled</li>
            <li>Supabase Auth → Email confirmation enabled</li>
            <li>Edge Function → RESEND_API_KEY secret set</li>
            <li>Edge Function → SEND_AUTH_EMAIL_HOOK_SECRET set</li>
            <li>Resend Dashboard → Sending domain verified</li>
            <li>Resend Dashboard → Not in sandbox mode</li>
          </ul>
        </div>
        
        <div className="flex flex-col gap-2">
          <Button asChild variant="outline" size="sm">
            <a href="https://supabase.com/dashboard/project/mqbupmusmciijsjmzbcu/auth/providers" target="_blank" rel="noopener noreferrer">
              Auth Providers <ExternalLink className="h-3 w-3 ml-1" />
            </a>
          </Button>
          <Button asChild variant="outline" size="sm">
            <a href="https://supabase.com/dashboard/project/mqbupmusmciijsjmzbcu/settings/functions" target="_blank" rel="noopener noreferrer">
              Edge Function Secrets <ExternalLink className="h-3 w-3 ml-1" />
            </a>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

// Section F: Console Logger
const ConsoleLogger = ({ logs, onClear }: { logs: LogEntry[]; onClear: () => void }) => {
  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Test Logs</CardTitle>
          <Button variant="ghost" size="sm" onClick={onClear}>
            <Trash2 className="h-4 w-4 mr-1" /> Clear
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="bg-slate-900 text-green-400 p-3 rounded max-h-64 overflow-auto text-xs font-mono">
          {logs.length === 0 ? (
            <p className="text-slate-500">No logs yet. Perform actions above to see logs.</p>
          ) : (
            logs.map((log, i) => (
              <div key={i} className={log.type === 'error' ? 'text-red-400' : log.type === 'info' ? 'text-blue-400' : ''}>
                [{new Date(log.time).toLocaleTimeString()}] {log.message}
              </div>
            ))
          )}
          <div ref={logsEndRef} />
        </div>
      </CardContent>
    </Card>
  );
};

// Main Debug Page
const DebugEmailVerification = () => {
  const [logs, setLogs] = useState<LogEntry[]>([]);

  const addLog = (entry: LogEntry) => {
    setLogs(prev => [...prev, entry]);
  };

  const clearLogs = () => {
    setLogs([]);
  };

  return (
    <div className="container mx-auto p-6 max-w-6xl">
      <h1 className="text-3xl font-bold mb-2">Email Verification Debug Dashboard</h1>
      <p className="text-muted-foreground mb-6">Diagnose email verification issues step by step</p>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <DebugUserInfo />
        <ConfigurationCheck />
        <TestEmailUpdate onLog={addLog} />
        <TestResendVerification onLog={addLog} />
        <div className="lg:col-span-2">
          <CheckEdgeFunctionLogs />
        </div>
        <div className="lg:col-span-2">
          <ConsoleLogger logs={logs} onClear={clearLogs} />
        </div>
      </div>
      
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Instructions</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="list-decimal ml-6 space-y-2 text-sm text-muted-foreground">
            <li>Review your current user state above (check if email/new_email fields are populated)</li>
            <li>Test updating your email using the form - this should trigger an email_change event</li>
            <li>Check the test logs section below for any errors</li>
            <li>Open Supabase Edge Function logs in another tab and look for recent entries</li>
            <li>If the edge function shows logs, check if it's processing the correct email</li>
            <li>If no edge function logs appear, the Auth Hook may not be triggering</li>
          </ol>
        </CardContent>
      </Card>
    </div>
  );
};

export default DebugEmailVerification;
