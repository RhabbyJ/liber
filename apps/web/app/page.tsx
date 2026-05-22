import Link from "next/link";

export default function HomePage() {
  return (
    <div className="home-page">
      <section className="home-hero">
        <div className="home-hero-inner">
          <div className="hero-copy">
            <h1>Meet <strong>the Buyer</strong> in Your Area</h1>
            <p>Browse, connect and transact real estate.</p>
            <div className="role-picker">
              <span>I&apos;m a:</span>
              <div className="actions">
                <Link className="button" href="/signup?role=seller&next=/seller/search">Seller</Link>
                <Link className="button secondary" href="/signup?role=buyer&next=/buyer/profile">Buyer</Link>
              </div>
            </div>
          </div>
          <div className="hero-visual" aria-hidden="true">
            <img src="/home-page.jpg" alt="" />
          </div>
        </div>
        <form className="home-search-panel" action="/seller/search">
          <label htmlFor="home-city">Where do you want to find buyers</label>
          <div className="search-bar">
            <input id="home-city" aria-label="Search location" name="city" placeholder="Northridge, CA" />
            <button className="button secondary" type="submit" aria-label="Search Buyers">Search</button>
          </div>
        </form>
      </section>

      <section className="content-band about-band">
        <div className="image-stack" aria-hidden="true">
          <div className="image-card one" />
          <div className="image-card two" />
        </div>
        <div className="section-copy">
          <p className="section-kicker">About Us</p>
          <h2>Revolutionizing Real Estate Connection</h2>
          <p>
            Search our network of buyers and select the best buyer for your property. Liber
            keeps all communication confidential, and sellers choose who learns about a property.
          </p>
          <div className="actions">
            <Link href="/signup?role=buyer&next=/buyer/profile">Signup as a Buyer</Link>
            <Link href="/signup?role=seller&next=/seller/search">Signup as a Seller</Link>
          </div>
          <div className="actions">
            <Link className="button" href="/seller/search">Learn More</Link>
          </div>
        </div>
      </section>

      <section className="content-band testimonial-band">
        <p className="section-kicker">Client Testimonial</p>
        <h2>Feedback about our Company</h2>
        <div className="testimonial-card">
          <p>
            I&apos;m a working professional with a growing roster of vacation rentals. I would
            love a chance to buy your property if it has something special.
          </p>
          <strong>Marina Valentine</strong>
          <span className="muted">Senior Marketer</span>
        </div>
      </section>

      <footer className="site-footer">
        <div className="site-footer-inner">
          <div>
            <h3>Liber</h3>
            <p>A buyer directory for sellers who want to find real demand before listing.</p>
          </div>
          <div>
            <h4>Pages</h4>
            <p><Link href="/">Home</Link></p>
            <p><Link href="/buyer/profile">Buyers</Link></p>
            <p><Link href="/seller/search">Sellers</Link></p>
          </div>
          <div>
            <h4>Support</h4>
            <p>Verification</p>
            <p>Security</p>
            <p>Status</p>
          </div>
          <div>
            <h4>Newsletter</h4>
            <p>Subscribe to get latest news.</p>
            <input aria-label="Email address" placeholder="Enter Email Address" />
          </div>
        </div>
        <div className="footer-bottom">Copyrights 2026. All Rights Reserved</div>
      </footer>
    </div>
  );
}
