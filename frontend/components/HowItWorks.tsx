export function HowItWorks() {
  return (
    <section className="section" id="how">
      <div className="section-head io" data-dir="up">
        <span className="kicker">How it works</span>
        <h2>Three simple steps.</h2>
      </div>

      <div className="steps">
        <div className="step-block">
          <div className="io" data-dir="left">
            <div className="step-num">01</div>
            <h3>Connect a wallet</h3>
            <p>Link a Celo wallet. MiniPay works right away.</p>
          </div>
          <div className="io step-mock-wrap" data-dir="right">
            <div className="floaty">
              <div className="step-mock">
                <div className="mock-bar">
                  <span />
                  <span />
                  <span />
                </div>
                <div className="mock-row">
                  <span className="name">MiniPay</span>
                  <span className="mock-btn">Connect</span>
                </div>
                <div className="mock-row">
                  <span className="name">Valora</span>
                  <span className="tag">available</span>
                </div>
                <div className="mock-row">
                  <span className="name">WalletConnect</span>
                  <span className="tag">available</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="step-block reverse">
          <div className="io" data-dir="right">
            <div className="step-num">02</div>
            <h3>Set a limit</h3>
            <p>Pick the most Tapa can spend at once. You stay in control.</p>
          </div>
          <div className="io step-mock-wrap" data-dir="left">
            <div className="floaty">
              <div className="step-mock">
                <div className="mock-bar">
                  <span />
                  <span />
                  <span />
                </div>
                <div className="mock-slider-label">
                  <span>Session limit</span>
                  <span className="tag mono">cUSD</span>
                </div>
                <div className="mock-slider-num">$5.00</div>
                <div className="mock-track">
                  <div className="mock-thumb-fill" />
                  <div className="mock-thumb-dot" />
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="step-block">
          <div className="io" data-dir="left">
            <div className="step-num">03</div>
            <h3>Let it flow</h3>
            <p>Turn it on. Tapa pays for what you use, right as you use it.</p>
          </div>
          <div className="io step-mock-wrap" data-dir="right">
            <div className="floaty">
              <div className="step-mock">
                <div className="mock-bar">
                  <span />
                  <span />
                  <span />
                </div>
                <span className="mock-flow-tag">flowing</span>
                <div className="mock-dial-mini">
                  <div className="ring" />
                  <div>
                    <div className="name">0.6 L settled</div>
                    <div className="tag">just now, on Celo</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
