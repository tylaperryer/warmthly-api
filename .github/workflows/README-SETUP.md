# GitHub Secrets Setup for OCI Deployment

This deployment uses GitHub Secrets to securely inject environment variables into your OCI Container Instance.

## Required GitHub Secrets

Add these secrets in your GitHub repository: **Settings → Secrets and variables → Actions**

### OCI Configuration
- `OCI_USERNAME` - Your OCI username (e.g., `tylaperryer@gmail.com`)
- `OCI_AUTH_TOKEN` - OCI Auth Token (from User Settings → Auth Tokens)
- `OCI_NAMESPACE` - OCI namespace (e.g., `id1oqczh26jb`)
- `OCI_CONFIG_FILE` - Base64 encoded OCI config file

### OCI Infrastructure OCIDs
- `OCI_COMPARTMENT_OCID` - Your compartment OCID (e.g., `ocid1.compartment.oc1.iad.amaaaaaa...`)
- `OCI_SUBNET_OCID` - Your subnet OCID (find in OCI Console → Networking → Virtual Cloud Networks → Your VCN → Subnets)
- `OCI_VCN_OCID` - Your VCN OCID (e.g., `ocid1.vcn.oc1.iad.amaaaaaa...`)

### Application Secrets
- `YOCO_SECRET_KEY` - Yoco payment gateway secret key (e.g., `sk_live_...`)
- `HUGGINGFACE_API_KEY` - Hugging Face API key (e.g., `hf_...`)
- `LIBRETRANSLATE_URL` - LibreTranslate URL (optional, e.g., `http://localhost:5000`)
- `LIBRETRANSLATE_API_KEY` - LibreTranslate API key (optional)

### Let's Encrypt (for HTTPS)
- `LE_EMAIL` - Email for Let's Encrypt certificate notifications
- `LE_STAGING` - Set to `true` for testing, `false` for production (optional, defaults to `false`)

### Container Instance Tracking
- `CONTAINER_INSTANCE_OCID` - Current container instance OCID (updated automatically after each deployment)

## How to Find OCIDs

### Compartment OCID
1. Go to **OCI Console → Identity → Compartments**
2. Click on your compartment
3. Copy the OCID from the details page

### Subnet OCID
1. Go to **OCI Console → Networking → Virtual Cloud Networks**
2. Click on your VCN (`warmthly-apiwar-vcn`)
3. Click **Subnets** in the left menu
4. Click on your subnet (`warmthly-public-subnet`)
5. Copy the OCID from the details page

### VCN OCID
1. Go to **OCI Console → Networking → Virtual Cloud Networks**
2. Click on your VCN (`warmthly-apiwar-vcn`)
3. Copy the OCID from the details page

## How It Works

1. **Push to main branch** → GitHub Actions triggers
2. **Build Docker image** → Pushes to OCI Container Registry
3. **Create new container instance** → With secrets from GitHub Secrets as environment variables
4. **Wait for health check** → Ensures new instance is working
5. **Delete old container instance** → Cleans up previous instance
6. **Output new OCID** → Update `CONTAINER_INSTANCE_OCID` secret for next deployment

## First Time Setup

1. Add all required secrets to GitHub
2. Push to `main` branch or manually trigger workflow
3. After first deployment, copy the new container instance OCID
4. Update `CONTAINER_INSTANCE_OCID` secret with the new OCID
5. Future deployments will automatically delete the old instance

## Updating Secrets

Simply update the secret value in GitHub Secrets and redeploy:
1. Go to **Settings → Secrets and variables → Actions**
2. Update the secret value
3. Push to `main` or manually trigger workflow
4. New container instance will be created with updated secrets
5. Old instance will be automatically deleted

## Benefits

✅ **Simple**: No IAM policies or Vault setup needed  
✅ **Secure**: Secrets stored in GitHub Secrets (encrypted)  
✅ **Easy Updates**: Change secrets in GitHub, redeploy, done  
✅ **Automatic**: Creates new instance, deletes old one automatically  
✅ **Health Checks**: Waits for instance to be healthy before deleting old one

## Troubleshooting

### "OCI_COMPARTMENT_OCID not found"
- Make sure you've added all OCID secrets
- Verify OCIDs are correct (they start with `ocid1.`)

### "Subnet not found"
- Check `OCI_SUBNET_OCID` is correct
- Ensure subnet is in the same compartment

### "Health check failed"
- Container may need more time to start
- Check container logs in OCI Console
- Verify security list allows port 80

### "Failed to delete old instance"
- Old instance may already be deleted
- Check OCI Console for instance status
- This is non-fatal - deployment continues

