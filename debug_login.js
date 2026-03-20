async function testLogin() {
    try {
        console.log('Attempting login...');
        const response = await fetch('http://localhost:5000/api/auth/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                username: 'admin',
                password: 'password123',
                role: 'admin'
            })
        });

        const text = await response.text();
        console.log('Response Status:', response.status);
        console.log('Response Body:', text.substring(0, 500)); // Print first 500 chars

    } catch (error) {
        console.error('Error:', error.message);
    }
}

testLogin();
