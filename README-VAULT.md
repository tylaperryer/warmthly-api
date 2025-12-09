# OCI Vault Integration

This API now supports fetching secrets from OCI Vault at runtime, providing better security and easier secret rotation.

## How It Works

1. **Secrets stored in OCI Vault** - All sensitive keys are stored securely in OCI Vault
2. **Secret OCIDs in environment** - Container instance only stores secret OCIDs (not actual values)
3. **Runtime fetching** - API fetches secret values from Vault when it starts
4. **Automatic authentication** - Uses Instance Principal when running in OCI (no credentials needed)

## Setup

### 1. Create Secrets in OCI Vault

1. Go to **OCI Console → Vault → Your Vault → Secrets**
2. Create secrets:
   - `huggingface-api-key` - Your Hugging Face API token
   - `yoco-secret-key` - Your Yoco payment secret key
   - `libretranslate-url` - LibreTranslate instance URL (optional)
   - `libretranslate-api-key` - LibreTranslate API key (optional)

3. **Copy the Secret OCIDs** (you'll need these)

### 2. Update Container Instance Environment Variables

Instead of storing secret values, store secret OCIDs:

**Old way (not recommended):**
```
YOCO_SECRET_KEY=sk_live_xxxxxxxxxxxxx
HUGGINGFACE_API_KEY=hf_xxxxxxxxxxxxx
```

**New way (recommended):**
```
YOCO_SECRET_OCID=ocid1.vaultsecret.oc1.iad.amaaaaaa...
HUGGINGFACE_SECRET_OCID=ocid1.vaultsecret.oc1.iad.amaaaaaa...
LIBRETRANSLATE_SECRET_OCID=ocid1.vaultsecret.oc1.iad.amaaaaaa...
```

### 3. Grant Vault Access to Container Instance

The container instance needs permission to read secrets from Vault:

1. Go to **OCI Console → Identity → Policies**
2. Create or update a policy:

```hcl
Allow dynamic-group warmthly-api-containers to read secret-family in compartment tylaperryer
Allow dynamic-group warmthly-api-containers to use vaults in compartment tylaperryer
```

3. Create a **Dynamic Group** for your container instances:
   - Name: `warmthly-api-containers`
   - Rule: `resource.id = 'ocid1.computecontainerinstance.oc1.iad.YOUR_OCID'`

Or use a simpler rule for all container instances in a compartment:
```
ALL {resource.type = 'computecontainerinstance', resource.compartment.id = 'ocid1.compartment.oc1...'}
```

## Benefits

✅ **Security**: Secrets never stored in container instance config  
✅ **Rotation**: Rotate secrets in Vault without recreating containers  
✅ **Audit**: All secret access is logged in OCI Audit  
✅ **Centralized**: Manage all secrets in one place  
✅ **Automatic**: Uses Instance Principal (no credentials to manage)

## Fallback Behavior

If Vault is unavailable or OCIDs are not provided, the API automatically falls back to:
- Direct environment variables (`YOCO_SECRET_KEY`, `HUGGINGFACE_API_KEY`, etc.)
- This ensures the API continues working even if Vault is temporarily unavailable

## Local Development

For local development, the API will:
1. Try to use OCI config file (`~/.oci/config`)
2. Fall back to environment variables if config file not available

Set environment variables directly:
```bash
export YOCO_SECRET_KEY=sk_live_...
export HUGGINGFACE_API_KEY=hf_...
npm start
```

## Troubleshooting

### "Failed to load secrets from Vault"

**Check:**
1. Secret OCIDs are correct in container instance environment variables
2. Dynamic group includes your container instance
3. Policy allows the dynamic group to read secrets
4. Vault is in the same compartment or policy allows cross-compartment access

### "OCI authentication provider not available"

**For local development:**
- Install OCI CLI: `brew install oci-cli` (Mac) or see [OCI CLI docs](https://docs.oracle.com/en-us/iaas/Content/API/SDKDocs/cliinstall.htm)
- Run `oci setup config` to create config file
- Or use environment variables directly

**For OCI Container Instance:**
- Ensure Instance Principal is enabled (automatic for container instances)
- Check dynamic group membership
- Verify policies allow secret access

## Secret Rotation

To rotate a secret:

1. **Update secret in Vault:**
   - Go to Vault → Secrets → Your secret
   - Click "Create new version"
   - Enter new secret value
   - Save

2. **Restart container instance:**
   - Container will automatically fetch the new secret version on next startup
   - No code changes needed!

## Example: Adding a New Secret

1. Create secret in Vault: `new-api-key`
2. Copy secret OCID
3. Add to container instance environment: `NEW_API_KEY_SECRET_OCID=ocid1.vaultsecret...`
4. Update `vault-secrets.js` to load it:
   ```javascript
   if (process.env.NEW_API_KEY_SECRET_OCID) {
     secrets.NEW_API_KEY = await getSecret(process.env.NEW_API_KEY_SECRET_OCID, provider);
   }
   ```
5. Use in code: `secrets.NEW_API_KEY`

