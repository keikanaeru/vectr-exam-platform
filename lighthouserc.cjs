module.exports = {
  ci: {
    collect: {
      url: [process.env.CI ? "http://127.0.0.1:3000/" : "https://exam.vectrtech.my.id/"],
      numberOfRuns: 3,
      ...(process.env.CI ? {
        startServerCommand: "npm start",
        startServerReadyTimeout: 30000
      } : {})
    },
    assert: {
      assertions: {
        "categories:performance": ["warn", { minScore: 0.80 }],
        "categories:accessibility": ["error", { minScore: 0.90 }],
        "categories:best-practices": ["error", { minScore: 0.90 }],
        "categories:seo": ["warn", { minScore: 0.80 }]
      }
    },
    upload: {
      target: "temporary-public-storage"
    }
  }
};
