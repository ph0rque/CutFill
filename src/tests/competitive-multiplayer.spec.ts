import { test, expect, Browser, BrowserContext, Page } from '@playwright/test';

// Constants
const APP_URL = 'http://localhost:5173';
const SERVER_HEALTH_URL = 'http://localhost:3001/api/health';
const LOBBIES_API_URL = 'http://localhost:3001/api/lobbies';
const LOBBY_LOAD_TIMEOUT = 15000;
const GUEST_REGISTRATION_TIMEOUT = 10000;

test.describe('Competitive Multiplayer Lobby System', () => {
  test.beforeAll(async () => {
    // Check if server is running
    try {
      const response = await fetch(SERVER_HEALTH_URL);
      const health = await response.json();
      console.log('Server health check:', health);
      if (!response.ok) {
        throw new Error('Server not healthy');
      }
    } catch (error) {
      throw new Error(`Server not running on port 3001. Please start the server first. Error: ${error}`);
    }
  });

  // Add delay between tests to prevent race conditions
  test.afterEach(async () => {
    await new Promise(resolve => setTimeout(resolve, 1000));
  });

  test('should handle single player lobby creation', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
      // Navigate to app
      await page.goto(APP_URL);
      await page.waitForLoadState('domcontentloaded');

      // Ensure guest form is visible
      await page.waitForSelector('#guest-container', { timeout: 5000 });

      // Fill out guest registration form for competition mode (use timestamp for uniqueness)
      const uniqueUsername = `Player1_${Date.now()}`;
      await page.fill('#guest-username', uniqueUsername);
      await page.selectOption('#guest-agerange', '13-25');
      await page.check('#mode-competition');
      
      // Submit form
      await page.click('button[type="submit"]');

      // Wait for guest data to be stored (indicates successful registration)
      await page.waitForFunction(() => {
        const guestData = localStorage.getItem('guestData');
        return guestData !== null && JSON.parse(guestData).mode === 'competition';
      }, { timeout: 10000 });

      // Wait for lobby screen to appear (using visibility check)
      await page.waitForFunction(() => {
        const lobbyScreen = document.querySelector('#lobby-screen') as HTMLElement;
        return lobbyScreen && lobbyScreen.style.display === 'block';
      }, { timeout: LOBBY_LOAD_TIMEOUT });
      
      // Verify lobby UI elements
      await expect(page.locator('#lobby-screen')).toBeVisible();
      await expect(page.locator('h2:has-text("🏆 Competitive Lobby")')).toBeVisible();
      await expect(page.locator('#lobby-status')).toContainText('Waiting for more players');
      await expect(page.locator('#player-count')).toContainText('1');
      
      // Verify player is listed
      await expect(page.locator('#players-list')).toContainText(uniqueUsername);
      
      // Ready button should not be visible yet (need 2+ players)
      await expect(page.locator('#ready-btn')).not.toBeVisible();

      // Take screenshot
      await page.screenshot({
        path: 'test-results/lobby-single-player.png',
        fullPage: true,
      });

    } finally {
      await context.close();
    }
  });

  test('should handle two players joining the same lobby', async ({ browser }) => {
    const context1 = await browser.newContext();
    const context2 = await browser.newContext();
    const page1 = await context1.newPage();
    const page2 = await context2.newPage();

    try {
      // Set up both players with unique usernames
      const player1Name = await setupPlayer(page1, 'Player1', '13-25');
      
      // Wait for Player 1 lobby to appear
      await page1.waitForFunction(() => {
        const lobbyScreen = document.querySelector('#lobby-screen') as HTMLElement;
        return lobbyScreen && lobbyScreen.style.display === 'block';
      }, { timeout: LOBBY_LOAD_TIMEOUT });
      
      const lobbyId1 = await page1.textContent('#current-lobby-id');
      
      // Set up Player 2
      const player2Name = await setupPlayer(page2, 'Player2', '26+');
      
      // Wait for Player 2 to join lobby
      await page2.waitForFunction(() => {
        const lobbyScreen = document.querySelector('#lobby-screen') as HTMLElement;
        return lobbyScreen && lobbyScreen.style.display === 'block';
      }, { timeout: LOBBY_LOAD_TIMEOUT });
      
      // Verify both players are in the same lobby
      const lobbyId2 = await page2.textContent('#current-lobby-id');
      expect(lobbyId1).toBe(lobbyId2);
      
      // Both pages should show 2 players
      await expect(page1.locator('#player-count')).toContainText('2');
      await expect(page2.locator('#player-count')).toContainText('2');
      
      // Both should show ready to start message
      await expect(page1.locator('#lobby-status')).toContainText('Ready to start');
      await expect(page2.locator('#lobby-status')).toContainText('Ready to start');
      
      // Ready buttons should be visible
      await expect(page1.locator('#ready-btn')).toBeVisible();
      await expect(page2.locator('#ready-btn')).toBeVisible();
      
      // Both players should be listed (using unique usernames)
      await expect(page1.locator('#players-list')).toContainText(player1Name);
      await expect(page1.locator('#players-list')).toContainText(player2Name);
      await expect(page2.locator('#players-list')).toContainText(player1Name);
      await expect(page2.locator('#players-list')).toContainText(player2Name);

      // Take screenshot
      await page1.screenshot({
        path: 'test-results/lobby-two-players-p1.png',
        fullPage: true,
      });
      await page2.screenshot({
        path: 'test-results/lobby-two-players-p2.png',
        fullPage: true,
      });

    } finally {
      await context1.close();
      await context2.close();
    }
  });

  test('should handle ready system and match countdown', async ({ browser }) => {
    const context1 = await browser.newContext();
    const context2 = await browser.newContext();
    const page1 = await context1.newPage();
    const page2 = await context2.newPage();

    try {
      // Set up both players
      await setupPlayer(page1, 'Player1', '13-25');
      await setupPlayer(page2, 'Player2', '26+');
      
      // Wait for both to be in lobby
      await page1.waitForSelector('#lobby-screen', { timeout: LOBBY_LOAD_TIMEOUT });
      await page2.waitForSelector('#lobby-screen', { timeout: LOBBY_LOAD_TIMEOUT });
      
      // Player 1 ready up
      await page1.click('#ready-btn');
      
      // Verify Player 1 shows as ready in both windows
      await expect(page1.locator('#players-list')).toContainText('✓ Ready');
      await expect(page2.locator('#players-list')).toContainText('✓ Ready');
      
      // Player 2 ready up
      await page2.click('#ready-btn');
      
      // Wait for countdown to start
      await page1.waitForSelector('#lobby-timer', { timeout: 5000 });
      await page2.waitForSelector('#lobby-timer', { timeout: 5000 });
      
      // Verify countdown is visible
      await expect(page1.locator('#lobby-timer')).toBeVisible();
      await expect(page2.locator('#lobby-timer')).toBeVisible();
      await expect(page1.locator('#lobby-timer')).toContainText('Match starting in');
      
      // Take screenshot during countdown
      await page1.screenshot({
        path: 'test-results/lobby-countdown.png',
        fullPage: true,
      });
      
      // Wait for match to start (both should redirect to game)
      await Promise.all([
        page1.waitForFunction(() => !document.querySelector('#lobby-screen'), { timeout: 10000 }),
        page2.waitForFunction(() => !document.querySelector('#lobby-screen'), { timeout: 10000 })
      ]);
      
      // Verify lobby disappeared (game started)
      await expect(page1.locator('#lobby-screen')).not.toBeVisible();
      await expect(page2.locator('#lobby-screen')).not.toBeVisible();

    } finally {
      await context1.close();
      await context2.close();
    }
  });

  test('should handle player leaving lobby', async ({ browser }) => {
    const context1 = await browser.newContext();
    const context2 = await browser.newContext();
    const page1 = await context1.newPage();
    const page2 = await context2.newPage();

    try {
      // Set up both players
      await setupPlayer(page1, 'Player1', '13-25');
      await setupPlayer(page2, 'Player2', '26+');
      
      // Wait for both to be in lobby
      await page1.waitForSelector('#lobby-screen', { timeout: LOBBY_LOAD_TIMEOUT });
      await page2.waitForSelector('#lobby-screen', { timeout: LOBBY_LOAD_TIMEOUT });
      
      // Verify 2 players
      await expect(page1.locator('#player-count')).toContainText('2');
      await expect(page2.locator('#player-count')).toContainText('2');
      
      // Player 1 leaves lobby
      await page1.click('#leave-lobby-btn');
      
      // Player 1 should return to setup screen
      await page1.waitForSelector('#setup-screen', { timeout: 5000 });
      await expect(page1.locator('#setup-screen')).toBeVisible();
      await expect(page1.locator('#lobby-screen')).not.toBeVisible();
      
      // Player 2 should see updated count and status
      await expect(page2.locator('#player-count')).toContainText('1');
      await expect(page2.locator('#lobby-status')).toContainText('Waiting for more players');
      await expect(page2.locator('#ready-btn')).not.toBeVisible();
      
      // Player 2 should no longer see Player1 in list
      await expect(page2.locator('#players-list')).not.toContainText('Player1');
      await expect(page2.locator('#players-list')).toContainText('Player2');

    } finally {
      await context1.close();
      await context2.close();
    }
  });

  test('should handle four players in a lobby', async ({ browser }) => {
    const contexts: BrowserContext[] = [];
    const pages: Page[] = [];

    try {
      // Create 4 player contexts
      for (let i = 0; i < 4; i++) {
        const context = await browser.newContext();
        const page = await context.newPage();
        contexts.push(context);
        pages.push(page);
        
        await setupPlayer(page, `Player${i + 1}`, '13-25');
        await page.waitForSelector('#lobby-screen', { timeout: LOBBY_LOAD_TIMEOUT });
      }
      
      // Verify all players see 4/4 players
      for (const page of pages) {
        await expect(page.locator('#player-count')).toContainText('4');
        await expect(page.locator('#lobby-status')).toContainText('Ready to start');
        await expect(page.locator('#ready-btn')).toBeVisible();
      }
      
      // Verify all player names are visible to all players
      for (const page of pages) {
        for (let i = 1; i <= 4; i++) {
          await expect(page.locator('#players-list')).toContainText(`Player${i}`);
        }
      }
      
      // All players ready up
      for (const page of pages) {
        await page.click('#ready-btn');
      }
      
      // Wait for countdown on all pages
      for (const page of pages) {
        await page.waitForSelector('#lobby-timer', { timeout: 5000 });
        await expect(page.locator('#lobby-timer')).toBeVisible();
      }
      
      // Take screenshot of 4-player lobby
      await pages[0].screenshot({
        path: 'test-results/lobby-four-players.png',
        fullPage: true,
      });
      
    } finally {
      for (const context of contexts) {
        await context.close();
      }
    }
  });

  test('should create multiple lobbies when first is full', async ({ browser }) => {
    const contexts: BrowserContext[] = [];
    const pages: Page[] = [];

    try {
      // Create 5 players (should create 2 lobbies: 4+1)
      for (let i = 0; i < 5; i++) {
        const context = await browser.newContext();
        const page = await context.newPage();
        contexts.push(context);
        pages.push(page);
        
        await setupPlayer(page, `Player${i + 1}`, '13-25');
        await page.waitForSelector('#lobby-screen', { timeout: LOBBY_LOAD_TIMEOUT });
      }
      
      // First 4 players should be in the same lobby
      const lobby1Id = await pages[0].textContent('#current-lobby-id');
      for (let i = 1; i < 4; i++) {
        const lobbyId = await pages[i].textContent('#current-lobby-id');
        expect(lobbyId).toBe(lobby1Id);
        await expect(pages[i].locator('#player-count')).toContainText('4');
      }
      
      // 5th player should be in a different lobby
      const lobby2Id = await pages[4].textContent('#current-lobby-id');
      expect(lobby2Id).not.toBe(lobby1Id);
      await expect(pages[4].locator('#player-count')).toContainText('1');
      await expect(pages[4].locator('#lobby-status')).toContainText('Waiting for more players');
      
      console.log(`First lobby: ${lobby1Id}, Second lobby: ${lobby2Id}`);
      
    } finally {
      for (const context of contexts) {
        await context.close();
      }
    }
  });

  test('should handle username conflicts with suggestions', async ({ browser }) => {
    const context1 = await browser.newContext();
    const context2 = await browser.newContext();
    const page1 = await context1.newPage();
    const page2 = await context2.newPage();

    try {
      // Register first player
      await page1.goto(APP_URL);
      await page1.waitForLoadState('domcontentloaded');
      await page1.fill('#guest-username', 'TestPlayer');
      await page1.selectOption('#guest-agerange', '13-25');
      await page1.check('#mode-competition');
      await page1.click('button[type="submit"]');
      await page1.waitForSelector('#lobby-screen', { timeout: LOBBY_LOAD_TIMEOUT });
      
      // Try to register second player with same username
      await page2.goto(APP_URL);
      await page2.waitForLoadState('domcontentloaded');
      await page2.fill('#guest-username', 'TestPlayer');
      await page2.selectOption('#guest-agerange', '26+');
      await page2.check('#mode-competition');
      await page2.click('button[type="submit"]');
      
      // Should see error message with suggestion
      await page2.waitForSelector('#guest-error', { timeout: 5000 });
      await expect(page2.locator('#guest-error')).toBeVisible();
      await expect(page2.locator('#guest-error')).toContainText('Username taken');
      
      // Username field should be updated with suggestion
      const suggestedUsername = await page2.inputValue('#guest-username');
      expect(suggestedUsername).toMatch(/TestPlayer\d+/);
      
      // Submit with suggested username
      await page2.click('button[type="submit"]');
      await page2.waitForSelector('#lobby-screen', { timeout: LOBBY_LOAD_TIMEOUT });
      
      // Both should be in same lobby now
      await expect(page1.locator('#player-count')).toContainText('2');
      await expect(page2.locator('#player-count')).toContainText('2');

    } finally {
      await context1.close();
      await context2.close();
    }
  });

  test('should check server API endpoints', async ({ request }) => {
    // Test server health endpoint
    const healthResponse = await request.get(SERVER_HEALTH_URL);
    expect(healthResponse.ok()).toBeTruthy();
    
    const healthData = await healthResponse.json();
    expect(healthData).toHaveProperty('status', 'healthy');
    expect(healthData).toHaveProperty('competitiveLobbies');
    
    // Test lobbies endpoint
    const lobbiesResponse = await request.get(LOBBIES_API_URL);
    expect(lobbiesResponse.ok()).toBeTruthy();
    
    const lobbiesData = await lobbiesResponse.json();
    expect(lobbiesData).toHaveProperty('totalLobbies');
    expect(lobbiesData).toHaveProperty('lobbies');
  });
});

// Helper function to set up a player
async function setupPlayer(page: Page, baseUsername: string, ageRange: string) {
  await page.goto(APP_URL);
  await page.waitForLoadState('domcontentloaded');
  
  // Ensure guest form is visible
  await page.waitForSelector('#guest-container', { timeout: 5000 });
  
  // Use unique username with timestamp to avoid conflicts
  const uniqueUsername = `${baseUsername}_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
  await page.fill('#guest-username', uniqueUsername);
  await page.selectOption('#guest-agerange', ageRange);
  await page.check('#mode-competition');
  await page.click('button[type="submit"]');
  
  // Wait for guest data to be stored (indicates successful registration)
  await page.waitForFunction(() => {
    const guestData = localStorage.getItem('guestData');
    return guestData !== null;
  }, { timeout: 10000 });
  
  // Wait a bit more for lobby processing
  await page.waitForTimeout(1000);
  
  return uniqueUsername;
} 