import React, { useEffect, useState } from 'react';

const OnboardingStepper = () => {
    const [companyName, setCompanyName] = useState('');

    useEffect(() => {
        const storedCompanyName = localStorage.getItem('pending-company-seed');
        if (storedCompanyName) {
            setCompanyName(storedCompanyName);
        }
    }, []);

    return (
        <div>
            <h1>Onboarding Stepper</h1>
            <p>Company Name: {companyName}</p>
            {/* Other onboarding steps here */}
        </div>
    );
};

export default OnboardingStepper;