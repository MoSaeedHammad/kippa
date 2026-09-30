import '@testing-library/jest-dom/vitest';
import '@/i18n';

if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};
