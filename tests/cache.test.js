const { cache } = require('../src/utils/cache');

describe('Cache', () => {
  beforeEach(() => {
    // Clear cache before each test
    cache.clear();
  });

  describe('set and get', () => {
    test('should store and retrieve values', () => {
      cache.set('test_key', 'test_value');
      expect(cache.get('test_key')).toBe('test_value');
    });

    test('should return undefined for non-existent keys', () => {
      expect(cache.get('non_existent')).toBeUndefined();
    });
  });

  describe('TTL (Time To Live)', () => {
    test('should expire entries after TTL', async () => {
      cache.set('temp_key', 'temp_value', 100); // 100ms TTL
      expect(cache.get('temp_key')).toBe('temp_value');

      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 150));
      expect(cache.get('temp_key')).toBeUndefined();
    });

    test('should not expire entries without TTL', () => {
      cache.set('permanent_key', 'permanent_value');
      expect(cache.get('permanent_key')).toBe('permanent_value');
    });
  });

  describe('delete and clear', () => {
    test('should delete specific keys', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');

      cache.delete('key1');
      expect(cache.get('key1')).toBeUndefined();
      expect(cache.get('key2')).toBe('value2');
    });

    test('should clear all entries', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');

      cache.clear();
      expect(cache.get('key1')).toBeUndefined();
      expect(cache.get('key2')).toBeUndefined();
    });
  });

  describe('has', () => {
    test('should check if key exists', () => {
      cache.set('existing_key', 'value');
      expect(cache.has('existing_key')).toBe(true);
      expect(cache.has('non_existing_key')).toBe(false);
    });
  });

  describe('stats', () => {
    test('should track cache statistics', () => {
      const stats = cache.getStats();
      expect(stats).toHaveProperty('totalKeys');
      expect(stats).toHaveProperty('expiredKeys');
      expect(stats).toHaveProperty('validKeys');
      expect(stats).toHaveProperty('maxSize');
      expect(stats).toHaveProperty('utilizationPercent');
      expect(stats).toHaveProperty('avgAccessTime');
      expect(stats).toHaveProperty('memoryUsage');
    });

    test('should return correct stats for empty cache', () => {
      const stats = cache.getStats();
      expect(stats.totalKeys).toBe(0);
      expect(stats.expiredKeys).toBe(0);
      expect(stats.validKeys).toBe(0);
    });

    test('should return correct stats after adding entries', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');

      const stats = cache.getStats();
      expect(stats.totalKeys).toBe(2);
      expect(stats.validKeys).toBe(2);
      expect(stats.expiredKeys).toBe(0);
    });
  });
});