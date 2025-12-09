/**
 * Oracle Database Client
 * Handles connections and queries to Oracle Database
 * Used for storing and retrieving donations/coins data
 */

const logger = require('./logger');

let pool = null;
let isInitialized = false;

/**
 * Initialize Oracle Database connection pool
 * @returns {Promise<void>}
 */
async function initializePool() {
  if (isInitialized && pool) {
    return;
  }

  const oracledb = require('oracledb');
  const dbUrl = process.env.ORACLE_DB_URL;

  if (!dbUrl) {
    logger.warn('[oracle-db] ORACLE_DB_URL not set, Oracle DB features disabled');
    return;
  }

  try {
    // Parse connection string: oracle://user:password@host:port/service
    const url = new URL(dbUrl.replace('oracle://', 'https://'));
    const config = {
      user: url.username,
      password: url.password,
      connectString: `${url.hostname}:${url.port || 1521}/${url.pathname.replace('/', '')}`,
      poolMin: 2,
      poolMax: 10,
      poolIncrement: 1,
      poolTimeout: 60,
    };

    pool = await oracledb.createPool(config);
    isInitialized = true;
    logger.log('[oracle-db] Connection pool created successfully');
  } catch (error) {
    logger.error('[oracle-db] Failed to create connection pool:', error.message);
    throw error;
  }
}

/**
 * Get a connection from the pool
 * @returns {Promise<Object>} Oracle connection
 */
async function getConnection() {
  if (!pool) {
    await initializePool();
  }

  if (!pool) {
    throw new Error('Oracle database pool not initialized');
  }

  return await pool.getConnection();
}

/**
 * Execute a query
 * @param {string} sql - SQL query
 * @param {Object|Array} binds - Query parameters
 * @param {Object} options - Query options
 * @returns {Promise<Object>} Query result
 */
async function executeQuery(sql, binds = {}, options = {}) {
  let connection;
  
  try {
    connection = await getConnection();
    const result = await connection.execute(sql, binds, {
      outFormat: require('oracledb').OUT_FORMAT_OBJECT,
      ...options,
    });
    return result.rows || [];
  } catch (error) {
    logger.error('[oracle-db] Query error:', {
      sql: sql.substring(0, 100),
      error: error.message,
    });
    throw error;
  } finally {
    if (connection) {
      try {
        await connection.close();
      } catch (closeError) {
        logger.error('[oracle-db] Error closing connection:', closeError.message);
      }
    }
  }
}

/**
 * Get all donations
 * @param {Object} options - Query options (limit, offset, category, etc.)
 * @returns {Promise<Array>} Array of donations
 */
async function getDonations(options = {}) {
  const {
    limit = 1000,
    offset = 0,
    category,
    orderBy = 'donation_date',
    orderDirection = 'DESC',
  } = options;

  let sql = `
    SELECT 
      ID,
      TRANSACTION_ID,
      AMOUNT,
      CURRENCY,
      DONOR,
      PURPOSE,
      CATEGORY,
      DONATION_DATE,
      CREATED_AT,
      UPDATED_AT
    FROM donations
    WHERE 1=1
  `;

  const binds = {};

  if (category) {
    sql += ' AND category = :category';
    binds.category = category;
  }

  sql += ` ORDER BY ${orderBy} ${orderDirection}`;
  sql += ' OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY';
  binds.offset = offset;
  binds.limit = limit;

  try {
    const rows = await executeQuery(sql, binds);
    return rows.map(row => ({
      id: row.ID,
      transactionId: row.TRANSACTION_ID,
      amount: parseFloat(row.AMOUNT),
      currency: row.CURRENCY || 'ZAR',
      donor: row.DONOR || 'Anonymous',
      purpose: row.PURPOSE || 'N/A',
      category: row.CATEGORY || 'General',
      date: row.DONATION_DATE ? new Date(row.DONATION_DATE).toISOString() : new Date().toISOString(),
      createdAt: row.CREATED_AT ? new Date(row.CREATED_AT).toISOString() : null,
      updatedAt: row.UPDATED_AT ? new Date(row.UPDATED_AT).toISOString() : null,
    }));
  } catch (error) {
    logger.error('[oracle-db] Error fetching donations:', error.message);
    throw error;
  }
}

/**
 * Get donation by transaction ID
 * @param {string} transactionId - Transaction ID
 * @returns {Promise<Object|null>} Donation object or null
 */
async function getDonationByTransactionId(transactionId) {
  const sql = `
    SELECT 
      ID,
      TRANSACTION_ID,
      AMOUNT,
      CURRENCY,
      DONOR,
      PURPOSE,
      CATEGORY,
      DONATION_DATE,
      CREATED_AT,
      UPDATED_AT
    FROM donations
    WHERE TRANSACTION_ID = :transactionId
  `;

  try {
    const rows = await executeQuery(sql, { transactionId });
    if (rows.length === 0) {
      return null;
    }

    const row = rows[0];
    return {
      id: row.ID,
      transactionId: row.TRANSACTION_ID,
      amount: parseFloat(row.AMOUNT),
      currency: row.CURRENCY || 'ZAR',
      donor: row.DONOR || 'Anonymous',
      purpose: row.PURPOSE || 'N/A',
      category: row.CATEGORY || 'General',
      date: row.DONATION_DATE ? new Date(row.DONATION_DATE).toISOString() : new Date().toISOString(),
      createdAt: row.CREATED_AT ? new Date(row.CREATED_AT).toISOString() : null,
      updatedAt: row.UPDATED_AT ? new Date(row.UPDATED_AT).toISOString() : null,
    };
  } catch (error) {
    logger.error('[oracle-db] Error fetching donation:', error.message);
    throw error;
  }
}

/**
 * Create a new donation
 * @param {Object} donation - Donation data
 * @returns {Promise<Object>} Created donation
 */
async function createDonation(donation) {
  const {
    transactionId,
    amount,
    currency = 'ZAR',
    donor,
    purpose,
    category = 'General',
    donationDate = new Date(),
  } = donation;

  if (!transactionId || !amount) {
    throw new Error('transactionId and amount are required');
  }

  const sql = `
    INSERT INTO donations (
      TRANSACTION_ID,
      AMOUNT,
      CURRENCY,
      DONOR,
      PURPOSE,
      CATEGORY,
      DONATION_DATE
    ) VALUES (
      :transactionId,
      :amount,
      :currency,
      :donor,
      :purpose,
      :category,
      :donationDate
    )
  `;

  try {
    const binds = {
      transactionId,
      amount: parseFloat(amount),
      currency,
      donor: donor || 'Anonymous',
      purpose: purpose || 'N/A',
      category,
      donationDate: donationDate instanceof Date ? donationDate : new Date(donationDate),
    };

    let connection;
    try {
      connection = await getConnection();
      await connection.execute(sql, binds, {
        autoCommit: true,
      });

      // Fetch the inserted row
      const inserted = await getDonationByTransactionId(transactionId);
      return inserted;
    } finally {
      if (connection) {
        await connection.close();
      }
    }
  } catch (error) {
    if (error.errorNum === 1) {
      // Unique constraint violation (transaction_id already exists)
      throw new Error('Donation with this transaction ID already exists');
    }
    logger.error('[oracle-db] Error creating donation:', error.message);
    throw error;
  }
}

/**
 * Close the connection pool
 * @returns {Promise<void>}
 */
async function closePool() {
  if (pool) {
    try {
      await pool.close(10); // Wait up to 10 seconds
      pool = null;
      isInitialized = false;
      logger.log('[oracle-db] Connection pool closed');
    } catch (error) {
      logger.error('[oracle-db] Error closing pool:', error.message);
    }
  }
}

/**
 * Check if Oracle DB is configured
 * @returns {boolean}
 */
function isConfigured() {
  return !!process.env.ORACLE_DB_URL;
}

module.exports = {
  initializePool,
  getConnection,
  executeQuery,
  getDonations,
  getDonationByTransactionId,
  createDonation,
  closePool,
  isConfigured,
};

