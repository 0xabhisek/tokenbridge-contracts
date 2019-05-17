const assert = require('assert')
const Web3Utils = require('web3-utils')
const env = require('../loadEnv')

const { deployContract, privateKeyToAddress, sendRawTxForeign } = require('../deploymentUtils')
const { web3Foreign, deploymentPrivateKey, FOREIGN_RPC_URL } = require('../web3')

const EternalStorageProxy = require('../../../build/contracts/EternalStorageProxy.json')
const BridgeValidators = require('../../../build/contracts/BridgeValidators.json')
const ForeignBridge = require('../../../build/contracts/ForeignAMB')

const VALIDATORS = env.VALIDATORS.split(' ')

const {
  DEPLOYMENT_ACCOUNT_PRIVATE_KEY,
  REQUIRED_NUMBER_OF_VALIDATORS,
  FOREIGN_GAS_PRICE,
  FOREIGN_BRIDGE_OWNER,
  FOREIGN_VALIDATORS_OWNER,
  FOREIGN_UPGRADEABLE_ADMIN,
  FOREIGN_MAX_AMOUNT_PER_TX,
  FOREIGN_REQUIRED_BLOCK_CONFIRMATIONS,
  HOME_AMB_SUBSIDIZED_MODE,
  FOREIGN_AMB_SUBSIDIZED_MODE
} = env

const DEPLOYMENT_ACCOUNT_ADDRESS = privateKeyToAddress(DEPLOYMENT_ACCOUNT_PRIVATE_KEY)

async function deployForeign() {
  console.log('========================================')
  console.log('deploying ForeignBridge')
  console.log('========================================\n')
  let foreignNonce = await web3Foreign.eth.getTransactionCount(DEPLOYMENT_ACCOUNT_ADDRESS)

  console.log('deploying storage for foreign validators')
  const storageValidatorsForeign = await deployContract(EternalStorageProxy, [], {
    from: DEPLOYMENT_ACCOUNT_ADDRESS,
    network: 'foreign',
    nonce: foreignNonce
  })
  foreignNonce++
  console.log('[Foreign] BridgeValidators Storage: ', storageValidatorsForeign.options.address)

  console.log('\ndeploying implementation for foreign validators')
  const bridgeValidatorsForeign = await deployContract(BridgeValidators, [], {
    from: DEPLOYMENT_ACCOUNT_ADDRESS,
    network: 'foreign',
    nonce: foreignNonce
  })
  foreignNonce++
  console.log(
    '[Foreign] BridgeValidators Implementation: ',
    bridgeValidatorsForeign.options.address
  )

  console.log('\nhooking up eternal storage to BridgeValidators')
  const upgradeToBridgeVForeignData = await storageValidatorsForeign.methods
    .upgradeTo('1', bridgeValidatorsForeign.options.address)
    .encodeABI({ from: DEPLOYMENT_ACCOUNT_ADDRESS })
  const txUpgradeToBridgeVForeign = await sendRawTxForeign({
    data: upgradeToBridgeVForeignData,
    nonce: foreignNonce,
    to: storageValidatorsForeign.options.address,
    privateKey: deploymentPrivateKey,
    url: FOREIGN_RPC_URL
  })
  assert.strictEqual(
    Web3Utils.hexToNumber(txUpgradeToBridgeVForeign.status),
    1,
    'Transaction Failed'
  )
  foreignNonce++

  console.log('\ninitializing Foreign Bridge Validators with following parameters:\n')
  console.log(
    `REQUIRED_NUMBER_OF_VALIDATORS: ${REQUIRED_NUMBER_OF_VALIDATORS}, VALIDATORS: ${VALIDATORS}`
  )
  bridgeValidatorsForeign.options.address = storageValidatorsForeign.options.address
  const initializeForeignData = await bridgeValidatorsForeign.methods
    .initialize(REQUIRED_NUMBER_OF_VALIDATORS, VALIDATORS, FOREIGN_VALIDATORS_OWNER)
    .encodeABI({ from: DEPLOYMENT_ACCOUNT_ADDRESS })
  const txInitializeForeign = await sendRawTxForeign({
    data: initializeForeignData,
    nonce: foreignNonce,
    to: bridgeValidatorsForeign.options.address,
    privateKey: deploymentPrivateKey,
    url: FOREIGN_RPC_URL
  })
  assert.strictEqual(Web3Utils.hexToNumber(txInitializeForeign.status), 1, 'Transaction Failed')
  foreignNonce++

  console.log('\nTransferring ownership of ValidatorsProxy\n')
  const validatorsForeignOwnershipData = await storageValidatorsForeign.methods
    .transferProxyOwnership(FOREIGN_UPGRADEABLE_ADMIN)
    .encodeABI({ from: DEPLOYMENT_ACCOUNT_ADDRESS })
  const txValidatorsForeignOwnershipData = await sendRawTxForeign({
    data: validatorsForeignOwnershipData,
    nonce: foreignNonce,
    to: storageValidatorsForeign.options.address,
    privateKey: deploymentPrivateKey,
    url: FOREIGN_RPC_URL
  })
  assert.strictEqual(
    Web3Utils.hexToNumber(txValidatorsForeignOwnershipData.status),
    1,
    'Transaction Failed'
  )
  foreignNonce++

  console.log('\ndeploying foreignBridge storage\n')
  const foreignBridgeStorage = await deployContract(EternalStorageProxy, [], {
    from: DEPLOYMENT_ACCOUNT_ADDRESS,
    network: 'foreign',
    nonce: foreignNonce
  })
  foreignNonce++
  console.log('[Foreign] ForeignBridge Storage: ', foreignBridgeStorage.options.address)

  console.log('\ndeploying foreignBridge implementation\n')
  const foreignBridgeImplementation = await deployContract(ForeignBridge, [], {
    from: DEPLOYMENT_ACCOUNT_ADDRESS,
    network: 'foreign',
    nonce: foreignNonce
  })
  foreignNonce++
  console.log(
    '[Foreign] ForeignBridge Implementation: ',
    foreignBridgeImplementation.options.address
  )

  console.log('\nhooking up ForeignBridge storage to ForeignBridge implementation')
  const upgradeToForeignBridgeData = await foreignBridgeStorage.methods
    .upgradeTo('1', foreignBridgeImplementation.options.address)
    .encodeABI({ from: DEPLOYMENT_ACCOUNT_ADDRESS })
  const txUpgradeToForeignBridge = await sendRawTxForeign({
    data: upgradeToForeignBridgeData,
    nonce: foreignNonce,
    to: foreignBridgeStorage.options.address,
    privateKey: deploymentPrivateKey,
    url: FOREIGN_RPC_URL
  })
  assert.strictEqual(
    Web3Utils.hexToNumber(txUpgradeToForeignBridge.status),
    1,
    'Transaction Failed'
  )
  foreignNonce++

  console.log('\ninitializing Foreign Bridge with following parameters:\n')
  console.log(`Foreign Validators: ${storageValidatorsForeign.options.address},
  FOREIGN_MAX_AMOUNT_PER_TX: ${FOREIGN_MAX_AMOUNT_PER_TX} which is ${Web3Utils.fromWei(
    FOREIGN_MAX_AMOUNT_PER_TX
  )} in eth,
    HOME_GAS_PRICE: ${FOREIGN_GAS_PRICE}, HOME_REQUIRED_BLOCK_CONFIRMATIONS : ${FOREIGN_REQUIRED_BLOCK_CONFIRMATIONS}
  `)
  foreignBridgeImplementation.options.address = foreignBridgeStorage.options.address
  const initializeFBridgeData = await foreignBridgeImplementation.methods
    .initialize(
      storageValidatorsForeign.options.address,
      FOREIGN_MAX_AMOUNT_PER_TX,
      FOREIGN_GAS_PRICE,
      FOREIGN_REQUIRED_BLOCK_CONFIRMATIONS,
      FOREIGN_BRIDGE_OWNER
    )
    .encodeABI({ from: DEPLOYMENT_ACCOUNT_ADDRESS })
  const txInitializeBridge = await sendRawTxForeign({
    data: initializeFBridgeData,
    nonce: foreignNonce,
    to: foreignBridgeStorage.options.address,
    privateKey: deploymentPrivateKey,
    url: FOREIGN_RPC_URL
  })
  assert.strictEqual(Web3Utils.hexToNumber(txInitializeBridge.status), 1, 'Transaction Failed')
  foreignNonce++

  console.log('transferring proxy ownership to multisig for Foreign bridge Proxy contract')
  const bridgeOwnershipData = await foreignBridgeStorage.methods
    .transferProxyOwnership(FOREIGN_UPGRADEABLE_ADMIN)
    .encodeABI({ from: DEPLOYMENT_ACCOUNT_ADDRESS })
  const txBridgeOwnershipData = await sendRawTxForeign({
    data: bridgeOwnershipData,
    nonce: foreignNonce,
    to: foreignBridgeStorage.options.address,
    privateKey: deploymentPrivateKey,
    url: FOREIGN_RPC_URL
  })
  assert.strictEqual(Web3Utils.hexToNumber(txBridgeOwnershipData.status), 1, 'Transaction Failed')
  foreignNonce++

  if (HOME_AMB_SUBSIDIZED_MODE === 'true') {
    console.log('setting subsidized mode for home side')
    const homeBridgeSubsidizedModeData = await foreignBridgeImplementation.methods
      .setSubsidizedModeForForeignToHome()
      .encodeABI()
    const txHomeBridgeSubsidizedModeData = await sendRawTxForeign({
      data: homeBridgeSubsidizedModeData,
      nonce: foreignNonce,
      to: foreignBridgeStorage.options.address,
      privateKey: deploymentPrivateKey,
      url: FOREIGN_RPC_URL
    })
    assert.strictEqual(
      Web3Utils.hexToNumber(txHomeBridgeSubsidizedModeData.status),
      1,
      'Transaction Failed'
    )
    foreignNonce++
  }

  if (FOREIGN_AMB_SUBSIDIZED_MODE === 'true') {
    console.log('setting subsidized mode for foreign side')
    const foreignBridgeSubsidizedModeData = await foreignBridgeImplementation.methods
      .setSubsidizedModeForHomeToForeign()
      .encodeABI()
    const txForeignBridgeSubsidizedModeData = await sendRawTxForeign({
      data: foreignBridgeSubsidizedModeData,
      nonce: foreignNonce,
      to: foreignBridgeStorage.options.address,
      privateKey: deploymentPrivateKey,
      url: FOREIGN_RPC_URL
    })
    assert.strictEqual(
      Web3Utils.hexToNumber(txForeignBridgeSubsidizedModeData.status),
      1,
      'Transaction Failed'
    )
  }

  console.log('\nForeign Deployment Bridge completed\n')

  return {
    foreignBridge: {
      address: foreignBridgeStorage.options.address,
      deployedBlockNumber: Web3Utils.hexToNumber(foreignBridgeStorage.deployedBlockNumber)
    }
  }
}

module.exports = deployForeign