package main

import (
	"encoding/json"
	"fmt"
	"time"

	"github.com/hyperledger/fabric-contract-api-go/contractapi"
)

var validPurposes = map[string]bool{
	"essential":       true,
	"marketing":       true,
	"analytics":       true,
	"personalisation": true,
	"third_party":     true,
}

type ConsentRecord struct {
	ID            string `json:"id"`
	GuestIdHash   string `json:"guestIdHash"`
	TenantId      string `json:"tenantId"`
	Purpose       string `json:"purpose"`
	Action        string `json:"action"`
	Timestamp     string `json:"timestamp"`
	GrantedBy     string `json:"grantedBy"`
	TransactionId string `json:"transactionId"`
}

type ConsentContract struct {
	contractapi.Contract
}

func compositeKey(ctx contractapi.TransactionContextInterface, guestIdHash, tenantId, purpose string) (string, error) {
	return ctx.GetStub().CreateCompositeKey("consent", []string{guestIdHash, tenantId, purpose})
}

func historyKey(ctx contractapi.TransactionContextInterface, guestIdHash, tenantId, txID string) (string, error) {
	return ctx.GetStub().CreateCompositeKey("history", []string{guestIdHash, tenantId, txID})
}

func (c *ConsentContract) GrantConsent(
	ctx contractapi.TransactionContextInterface,
	guestIdHash, tenantId, purpose, grantedBy string,
) error {
	if !validPurposes[purpose] {
		return fmt.Errorf("invalid purpose '%s': must be one of essential, marketing, analytics, personalisation, third_party", purpose)
	}

	txID := ctx.GetStub().GetTxID()
	ts, err := ctx.GetStub().GetTxTimestamp()
	if err != nil {
		return fmt.Errorf("failed to get transaction timestamp: %w", err)
	}
	timestamp := time.Unix(ts.Seconds, int64(ts.Nanos)).UTC().Format(time.RFC3339)

	record := ConsentRecord{
		ID:            txID,
		GuestIdHash:   guestIdHash,
		TenantId:      tenantId,
		Purpose:       purpose,
		Action:        "granted",
		Timestamp:     timestamp,
		GrantedBy:     grantedBy,
		TransactionId: txID,
	}

	stateKey, err := compositeKey(ctx, guestIdHash, tenantId, purpose)
	if err != nil {
		return fmt.Errorf("failed to create composite key: %w", err)
	}

	recordBytes, err := json.Marshal(record)
	if err != nil {
		return fmt.Errorf("failed to marshal consent record: %w", err)
	}

	if err := ctx.GetStub().PutState(stateKey, recordBytes); err != nil {
		return fmt.Errorf("failed to put consent state: %w", err)
	}

	hKey, err := historyKey(ctx, guestIdHash, tenantId, txID)
	if err != nil {
		return fmt.Errorf("failed to create history key: %w", err)
	}
	if err := ctx.GetStub().PutState(hKey, recordBytes); err != nil {
		return fmt.Errorf("failed to put consent history: %w", err)
	}

	eventPayload, err := json.Marshal(map[string]string{
		"guestIdHash": guestIdHash,
		"tenantId":    tenantId,
		"purpose":     purpose,
		"grantedBy":   grantedBy,
		"txId":        txID,
	})
	if err != nil {
		return fmt.Errorf("failed to marshal event payload: %w", err)
	}
	if err := ctx.GetStub().SetEvent("consent.granted", eventPayload); err != nil {
		return fmt.Errorf("failed to emit consent.granted event: %w", err)
	}

	return nil
}

func (c *ConsentContract) RevokeConsent(
	ctx contractapi.TransactionContextInterface,
	guestIdHash, tenantId, purpose, revokedBy string,
) error {
	if !validPurposes[purpose] {
		return fmt.Errorf("invalid purpose '%s': must be one of essential, marketing, analytics, personalisation, third_party", purpose)
	}

	stateKey, err := compositeKey(ctx, guestIdHash, tenantId, purpose)
	if err != nil {
		return fmt.Errorf("failed to create composite key: %w", err)
	}

	existing, err := ctx.GetStub().GetState(stateKey)
	if err != nil {
		return fmt.Errorf("failed to read consent state: %w", err)
	}
	if existing == nil {
		return fmt.Errorf("no consent record found for guestIdHash=%s tenantId=%s purpose=%s", guestIdHash, tenantId, purpose)
	}

	txID := ctx.GetStub().GetTxID()
	ts, err := ctx.GetStub().GetTxTimestamp()
	if err != nil {
		return fmt.Errorf("failed to get transaction timestamp: %w", err)
	}
	timestamp := time.Unix(ts.Seconds, int64(ts.Nanos)).UTC().Format(time.RFC3339)

	record := ConsentRecord{
		ID:            txID,
		GuestIdHash:   guestIdHash,
		TenantId:      tenantId,
		Purpose:       purpose,
		Action:        "revoked",
		Timestamp:     timestamp,
		GrantedBy:     revokedBy,
		TransactionId: txID,
	}

	recordBytes, err := json.Marshal(record)
	if err != nil {
		return fmt.Errorf("failed to marshal revocation record: %w", err)
	}

	if err := ctx.GetStub().PutState(stateKey, recordBytes); err != nil {
		return fmt.Errorf("failed to put revocation state: %w", err)
	}

	hKey, err := historyKey(ctx, guestIdHash, tenantId, txID)
	if err != nil {
		return fmt.Errorf("failed to create history key: %w", err)
	}
	if err := ctx.GetStub().PutState(hKey, recordBytes); err != nil {
		return fmt.Errorf("failed to put revocation history: %w", err)
	}

	eventPayload, err := json.Marshal(map[string]string{
		"guestIdHash": guestIdHash,
		"tenantId":    tenantId,
		"purpose":     purpose,
		"revokedBy":   revokedBy,
		"txId":        txID,
	})
	if err != nil {
		return fmt.Errorf("failed to marshal event payload: %w", err)
	}
	if err := ctx.GetStub().SetEvent("consent.revoked", eventPayload); err != nil {
		return fmt.Errorf("failed to emit consent.revoked event: %w", err)
	}

	return nil
}

func (c *ConsentContract) GetConsentHistory(
	ctx contractapi.TransactionContextInterface,
	guestIdHash, tenantId string,
) ([]*ConsentRecord, error) {
	iterator, err := ctx.GetStub().GetStateByPartialCompositeKey("history", []string{guestIdHash, tenantId})
	if err != nil {
		return nil, fmt.Errorf("failed to get consent history: %w", err)
	}
	defer iterator.Close()

	var records []*ConsentRecord
	for iterator.HasNext() {
		kv, err := iterator.Next()
		if err != nil {
			return nil, fmt.Errorf("failed to iterate consent history: %w", err)
		}
		var record ConsentRecord
		if err := json.Unmarshal(kv.Value, &record); err != nil {
			return nil, fmt.Errorf("failed to unmarshal consent record: %w", err)
		}
		records = append(records, &record)
	}

	return records, nil
}

func (c *ConsentContract) GetActiveConsents(
	ctx contractapi.TransactionContextInterface,
	guestIdHash, tenantId string,
) ([]*ConsentRecord, error) {
	iterator, err := ctx.GetStub().GetStateByPartialCompositeKey("consent", []string{guestIdHash, tenantId})
	if err != nil {
		return nil, fmt.Errorf("failed to get active consents: %w", err)
	}
	defer iterator.Close()

	var records []*ConsentRecord
	for iterator.HasNext() {
		kv, err := iterator.Next()
		if err != nil {
			return nil, fmt.Errorf("failed to iterate consents: %w", err)
		}
		var record ConsentRecord
		if err := json.Unmarshal(kv.Value, &record); err != nil {
			return nil, fmt.Errorf("failed to unmarshal consent record: %w", err)
		}
		if record.Action == "granted" {
			records = append(records, &record)
		}
	}

	return records, nil
}

func (c *ConsentContract) HasConsent(
	ctx contractapi.TransactionContextInterface,
	guestIdHash, tenantId, purpose string,
) (bool, error) {
	if purpose == "essential" {
		return true, nil
	}

	if !validPurposes[purpose] {
		return false, fmt.Errorf("invalid purpose '%s'", purpose)
	}

	stateKey, err := compositeKey(ctx, guestIdHash, tenantId, purpose)
	if err != nil {
		return false, fmt.Errorf("failed to create composite key: %w", err)
	}

	recordBytes, err := ctx.GetStub().GetState(stateKey)
	if err != nil {
		return false, fmt.Errorf("failed to read consent state: %w", err)
	}
	if recordBytes == nil {
		return false, nil
	}

	var record ConsentRecord
	if err := json.Unmarshal(recordBytes, &record); err != nil {
		return false, fmt.Errorf("failed to unmarshal consent record: %w", err)
	}

	return record.Action == "granted", nil
}
