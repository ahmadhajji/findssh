import { useState, type ReactNode } from "react";
import { KeyRound, Server, ArrowRight, ShieldCheck } from "lucide-react";
import type { ConnectionInput, SavedConnection } from "../shared/types";
export function ConnectionForm({
  username,
  recent,
  busy,
  onConnect,
  onCancel,
}: {
  username: string;
  recent: SavedConnection[];
  busy: boolean;
  onConnect: (input: ConnectionInput) => void;
  onCancel?: () => void;
}): ReactNode {
  const [host, setHost] = useState("");
  const [user, setUser] = useState(username);
  const [port, setPort] = useState(22);
  const [password, setPassword] = useState("");
  const [key, setKey] = useState("");
  const [advanced, setAdvanced] = useState(false);
  const [keyError, setKeyError] = useState("");
  function connect(): void {
    onConnect({
      host: host.trim(),
      username: user.trim(),
      port,
      password,
      privateKeyPath: key,
      passphrase: "",
    });
    setPassword("");
  }
  return (
    <section className="connection">
      <div className="server-art">
        <Server size={44} strokeWidth={1.4} />
        <span>
          <ShieldCheck size={18} />
        </span>
      </div>
      <h1>Your server. Familiar territory.</h1>
      <p className="intro">
        Browse your server as comfortably as your Mac.
        <br />
        Enter an address to get started.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          connect();
        }}
      >
        <fieldset disabled={busy}>
          <label>
            Server address
            <input
              autoFocus
              placeholder="192.168.1.10 or my-server.tailnet.ts.net"
              value={host}
              onChange={(e) => setHost(e.target.value)}
              required
              spellCheck={false}
            />
          </label>
          <div className="form-row">
            <label>
              Username
              <input
                placeholder="Your server username"
                value={user}
                onChange={(e) => setUser(e.target.value)}
                required
                autoComplete="username"
              />
            </label>
            <label className="port">
              Port
              <input
                type="number"
                min={1}
                max={65535}
                value={port}
                onChange={(e) => setPort(Number(e.target.value))}
                required
              />
            </label>
          </div>
          <label>
            Password <span className="optional">optional for SSH keys</span>
            <input
              type="password"
              placeholder="Ask me when needed"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </label>
          <button
            type="button"
            className="text-button"
            onClick={() => setAdvanced(!advanced)}
          >
            {advanced ? "Hide" : "Show"} SSH key options
          </button>
          {advanced && (
            <div className="key-option">
              <p>Your SSH agent and default keys are tried automatically.</p>
              <button
                type="button"
                onClick={() => {
                  void window.findssh
                    .chooseKey()
                    .then((path) => {
                      if (path) setKey(path);
                    })
                    .catch((e) => setKeyError(String(e)));
                }}
              >
                <KeyRound size={14} />
                {key ? key.split("/").pop() : "Choose private key…"}
              </button>
              {key && (
                <button type="button" onClick={() => setKey("")}>
                  Clear
                </button>
              )}
              {keyError && <p role="alert">{keyError}</p>}
            </div>
          )}
          <div className="connect-actions">
            {onCancel && (
              <button type="button" onClick={onCancel}>
                Cancel
              </button>
            )}
            <button
              className="primary connect-button"
              disabled={!host.trim() || !user.trim() || busy}
            >
              {busy ? "Connecting…" : "Connect"}
              {!busy && <ArrowRight size={15} />}
            </button>
          </div>
        </fieldset>
      </form>
      <p className="privacy">
        <ShieldCheck size={13} /> Encrypted over SSH. Passwords are never saved.
      </p>
      {recent.length > 0 && (
        <div className="recent">
          <h3>Recent servers</h3>
          {recent.slice(0, 4).map((c) => (
            <button
              disabled={busy}
              key={`${c.username}@${c.host}:${c.port}`}
              onClick={() => {
                setHost(c.host);
                setUser(c.username);
                setPort(c.port);
                setKey(c.privateKeyPath);
              }}
            >
              <Server size={16} />
              <span>
                {c.host}
                <small>
                  {c.username} · Port {c.port}
                </small>
              </span>
              <ArrowRight size={14} />
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
