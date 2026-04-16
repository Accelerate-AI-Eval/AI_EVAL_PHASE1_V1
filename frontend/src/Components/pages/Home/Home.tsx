import React, { useEffect } from "react";
import "./home.css";

function Home() {
  useEffect(() => {
    document.title = "AI-Q | Home";
  }, []);

  return (
    <div className="home">
      <section className="home__hero">
        <h1 className="home__title">Welcome to the AI Eval Platform</h1>
        <p className="home__subtitle">
          Access completed reports and past assessment analyses.
        </p>
      </section>
      {/* <section className="home__content">
        <div className="home__card">
          <p className="home__card-text">
            Use the navigation menu to go to Dashboard, Assessments, Vendor Directory, and more.
          </p>
        </div>
      </section> */}
    </div>
  );
}

export default Home;