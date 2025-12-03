document.addEventListener('DOMContentLoaded', () => {
    const themeToggle = document.getElementById('theme-switch-checkbox');
    const currentTheme = localStorage.getItem('theme') || 'light';

    // Apply the saved theme on initial load
    document.body.setAttribute('data-theme', currentTheme);

    // Set the toggle switch state
    if (themeToggle) {
        if (currentTheme === 'dark') {
            themeToggle.checked = true;
        }
    }

    // Add event listener for the toggle switch
    if (themeToggle) {
        themeToggle.addEventListener('change', function() {
            let theme = 'light';
            if (this.checked) {
                theme = 'dark';
            }
            document.body.setAttribute('data-theme', theme);
            localStorage.setItem('theme', theme);
        });
    }
});