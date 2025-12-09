#!/bin/bash
# Helper script to get OCI OCIDs needed for GitHub Secrets
# Run this in OCI Cloud Shell or with OCI CLI configured

echo "🔍 Getting OCI OCIDs for GitHub Secrets setup..."
echo ""

# Get Compartment OCID
echo "📁 Compartment OCID:"
oci iam compartment list --all --query "data[?name=='tylaperryer (root)'].id | [0]" --raw-output
echo ""

# Get VCN OCID
echo "🌐 VCN OCID:"
oci network vcn list --compartment-id $(oci iam compartment list --all --query "data[?name=='tylaperryer (root)'].id | [0]" --raw-output) --query "data[?display-name=='warmthly-apiwar-vcn'].id | [0]" --raw-output
echo ""

# Get Subnet OCID
VCN_OCID=$(oci network vcn list --compartment-id $(oci iam compartment list --all --query "data[?name=='tylaperryer (root)'].id | [0]" --raw-output) --query "data[?display-name=='warmthly-apiwar-vcn'].id | [0]" --raw-output)
echo "🔗 Subnet OCID:"
oci network subnet list --compartment-id $(oci iam compartment list --all --query "data[?name=='tylaperryer (root)'].id | [0]" --raw-output) --vcn-id "$VCN_OCID" --query "data[?display-name=='warmthly-public-subnet'].id | [0]" --raw-output
echo ""

echo "✅ Copy these OCIDs and add them to GitHub Secrets:"
echo "   - OCI_COMPARTMENT_OCID"
echo "   - OCI_VCN_OCID"
echo "   - OCI_SUBNET_OCID"

