import { BrandMark } from "./BrandMark";
import { ConnectButton } from "./wallet/ConnectButton";

export function NavIsland() {
  return (
    <nav className="nav-island">
      <div className="brand">
        <BrandMark />
        tapa
      </div>
      <div className="nav-links">
        <a href="#how">How it works</a>
        <a href="#live">Live meter</a>
        <a href="#celo">Why Celo</a>
      </div>
      <ConnectButton
        className="nav-cta"
        label="Open the tap"
        showAddressWhenConnected
      />
    </nav>
  );
}
