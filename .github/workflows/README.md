# GitHub Actions Deployment

This workflow automatically deploys the API to OCI Container Instance when you push to GitHub.

## Setup Required

### 1. GitHub Secrets

Add these secrets to your GitHub repository (Settings → Secrets and variables → Actions):

- `OCI_USERNAME` - Your OCI username (e.g., `tylaperryer@gmail.com`)
- `OCI_AUTH_TOKEN` - Your OCI Auth Token (from User Settings → Auth Tokens)
- `OCI_NAMESPACE` - Your OCI namespace (e.g., `id1oqczh26jb`)
- `OCI_CONFIG_FILE` - Your OCI config file content (base64 encoded)

### 2. Get OCI Config File

In Cloud Shell, run:
```bash
cat ~/.oci/config | base64 -w 0
```

Copy the output and add it as `OCI_CONFIG_FILE` secret.

### 3. Update Container Instance OCID

Update `CONTAINER_INSTANCE_OCID` in `.github/workflows/deploy-oci.yml` with your actual container instance OCID.

## How It Works

1. Push code to GitHub
2. GitHub Actions builds Docker image
3. Pushes to OCI Container Registry
4. Restarts Container Instance with new image
5. Done!

## Manual Deployment

If you need to deploy manually:
```bash
# In Cloud Shell
cd warmthly-api
git pull
docker build -t us-ashburn-1.ocir.io/id1oqczh26jb/warmthly-api:latest .
docker push us-ashburn-1.ocir.io/id1oqczh26jb/warmthly-api:latest
# Then restart container instance in OCI Console
```

