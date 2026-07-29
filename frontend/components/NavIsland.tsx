import { BrandMark } from "./BrandMark";

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
      {/* Wallet connect is not wired yet, this is the visual target for it. */}
      <button type="button" className="nav-cta">
        Open the tap
      </button>
    </nav>
  );
}
