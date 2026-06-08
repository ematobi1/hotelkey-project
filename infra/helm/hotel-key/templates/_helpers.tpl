{{/*
Expand the name of the chart.
*/}}
{{- define "hotel-key.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
*/}}
{{- define "hotel-key.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- printf "%s" $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}

{{/*
Chart label.
*/}}
{{- define "hotel-key.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels applied to every resource.
*/}}
{{- define "hotel-key.labels" -}}
helm.sh/chart: {{ include "hotel-key.chart" . }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
Selector labels for a service, given the service name as .serviceName in the sub-context.
Usage: {{ include "hotel-key.selectorLabels" (dict "serviceName" $svcName) }}
*/}}
{{- define "hotel-key.selectorLabels" -}}
app: {{ .serviceName }}
{{- end }}

{{/*
Build the full image reference for a service.
Usage: {{ include "hotel-key.image" (dict "global" $.Values.global "svc" $svc) }}
*/}}
{{- define "hotel-key.image" -}}
{{- $registry := .global.imageRegistry -}}
{{- $tag := .global.imageTag -}}
{{- if $registry -}}
{{- printf "%s/%s:%s" $registry .svc.image $tag -}}
{{- else -}}
{{- printf "%s:%s" .svc.image $tag -}}
{{- end -}}
{{- end }}
