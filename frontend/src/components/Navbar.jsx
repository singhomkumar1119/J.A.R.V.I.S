import './Navbar.css';

export default function Navbar() {
  return (
    <nav className="navbar-container">
      <div className="navbar-logo">SYSTEM</div>
      <div className="navbar-links">
        <a className="nav-link" href="#home">Home</a>
        <a className="nav-link" href="#explore">Explore</a>
        <a className="nav-link" href="#modules">Modules</a>
        <a className="nav-link" href="#connect">Connect</a>
      </div>
    </nav>
  );
}
