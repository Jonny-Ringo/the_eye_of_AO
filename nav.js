document.addEventListener('DOMContentLoaded', function() {
    // Get elements with the new IDs
    const networkStatsLink = document.getElementById('networkStatsLink');
    const gamingStatsLink = document.getElementById('gamingStatsLink');
    const networkStatsContent = document.getElementById('networkStatsContent');
    const gamingStatsContent = document.getElementById('gamingStatsContent');

    // Function to switch between sections
    function switchSection(section) {
        // Remove active class from all links and content
        networkStatsLink.classList.remove('active');
        gamingStatsLink.classList.remove('active');
        networkStatsContent.classList.remove('active');
        gamingStatsContent.classList.remove('active');
        
        // Add active class to appropriate section
        if (section === 'networkStats') {
            networkStatsLink.classList.add('active');
            networkStatsContent.classList.add('active');
            window.history.pushState({section: 'networkStats'}, 'Network Stats', '#networkStats');
        } else if (section === 'gamingStats') {
            gamingStatsLink.classList.add('active');
            gamingStatsContent.classList.add('active');
            window.history.pushState({section: 'gamingStats'}, 'Gaming Stats', '#gamingStats');
        }
    }
    
    // Event listeners for navigation
    networkStatsLink.addEventListener('click', function(e) {
        e.preventDefault();
        switchSection('networkStats');
    });

    gamingStatsLink.addEventListener('click', function(e) {
        e.preventDefault();
        switchSection('gamingStats');
    });
    
    // Handle browser back/forward
    window.addEventListener('popstate', function(e) {
        if (e.state && e.state.section) {
            switchSection(e.state.section);
        } else {
            switchSection('networkStats');
        }
    });
    
    // Check hash on page load
    if (window.location.hash === '#gamingStats') {
        switchSection('gamingStats');
    } else {
        switchSection('networkStats');
        window.history.replaceState({section: 'networkStats'}, 'Network Stats', '#networkStats');
    }
});