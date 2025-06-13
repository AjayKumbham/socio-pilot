
import { schedulerManager } from './schedulerManager';

// Re-export for backward compatibility
export const scheduler = schedulerManager;

// Auto-start scheduler when module loads in browser
if (typeof window !== 'undefined') {
  const isActive = localStorage.getItem('scheduler_active') === 'true';
  if (isActive) {
    // Start with a small delay to ensure all modules are loaded
    setTimeout(() => {
      schedulerManager.start().catch(error => {
        console.error('Failed to start scheduler:', error);
      });
    }, 1000);
  }
}

export { schedulerManager };
