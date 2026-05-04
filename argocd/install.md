# ArgoCD — IMS Deployment Guide

## Prerequisites

- Kubernetes cluster (EKS / kind / minikube)
- kubectl configured
- Helm 3.x installed
- ArgoCD installed on cluster

## 1. Install ArgoCD on cluster

```bash
kubectl create namespace argocd
kubectl apply -n argocd -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml

# Wait for ArgoCD to be ready
kubectl wait --for=condition=available --timeout=300s deployment/argocd-server -n argocd

# Get initial admin password
kubectl -n argocd get secret argocd-initial-admin-secret \
  -o jsonpath="{.data.password}" | base64 -d
```

## 2. Apply IMS Project and Application

```bash
# Create the IMS namespace
kubectl create namespace ims

# Apply ArgoCD project
kubectl apply -f argocd/project.yaml

# Apply ArgoCD application
kubectl apply -f argocd/application.yaml
```

## 3. Access ArgoCD UI

```bash
# Port forward ArgoCD server
kubectl port-forward svc/argocd-server -n argocd 8080:443

# Open https://localhost:8080
# Login: admin / <password from step 1>
```

## 4. Watch deployment

ArgoCD will automatically:
1. Pull the Helm chart from `helm/ims/`
2. Deploy all IMS services to the `ims` namespace
3. Create namespace if it doesn't exist
4. Auto-sync on every push to `main` branch

## GitOps Flow