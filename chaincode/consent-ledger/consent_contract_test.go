package main

import (
	"encoding/json"
	"testing"

	"github.com/hyperledger/fabric-chaincode-go/shimtest"
	"github.com/hyperledger/fabric-contract-api-go/contractapi"
	"github.com/hyperledger/fabric-protos-go/peer"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

const (
	testGuestIdHash = "a665a45920422f9d417e4867efdc4fb8a04a1f3fff1fa07e998e86f7f7a27ae3"
	testTenantId    = "tenant-001"
	testPurpose     = "marketing"
	testGrantedBy   = "staff-007"
)

func newStubAndCtx(t *testing.T, txID string) (*shimtest.MockStub, contractapi.TransactionContextInterface) {
	t.Helper()
	stub := shimtest.NewMockStub("consent-ledger", nil)
	stub.MockTransactionStart(txID)
	ctx := &contractapi.TransactionContext{}
	ctx.SetStub(stub)
	return stub, ctx
}

func TestGrantConsent_success(t *testing.T) {
	stub, ctx := newStubAndCtx(t, "tx-grant")

	cc := &ConsentContract{}
	err := cc.GrantConsent(ctx, testGuestIdHash, testTenantId, testPurpose, testGrantedBy)
	require.NoError(t, err)

	stateKey, err := stub.CreateCompositeKey("consent", []string{testGuestIdHash, testTenantId, testPurpose})
	require.NoError(t, err)

	recordBytes := stub.State[stateKey]
	require.NotNil(t, recordBytes, "consent state should be written")

	var record ConsentRecord
	require.NoError(t, json.Unmarshal(recordBytes, &record))

	assert.Equal(t, testGuestIdHash, record.GuestIdHash)
	assert.Equal(t, testTenantId, record.TenantId)
	assert.Equal(t, testPurpose, record.Purpose)
	assert.Equal(t, "granted", record.Action)
	assert.Equal(t, testGrantedBy, record.GrantedBy)

	assertLastEvent(t, stub, "consent.granted")
}

func TestRevokeConsent_removesGrant(t *testing.T) {
	stub, ctx := newStubAndCtx(t, "tx-grant2")

	cc := &ConsentContract{}
	require.NoError(t, cc.GrantConsent(ctx, testGuestIdHash, testTenantId, testPurpose, testGrantedBy))

	stub.MockTransactionStart("tx-revoke")
	require.NoError(t, cc.RevokeConsent(ctx, testGuestIdHash, testTenantId, testPurpose, testGrantedBy))

	stateKey, err := stub.CreateCompositeKey("consent", []string{testGuestIdHash, testTenantId, testPurpose})
	require.NoError(t, err)

	recordBytes := stub.State[stateKey]
	require.NotNil(t, recordBytes)

	var record ConsentRecord
	require.NoError(t, json.Unmarshal(recordBytes, &record))
	assert.Equal(t, "revoked", record.Action)

	hasConsent, err := cc.HasConsent(ctx, testGuestIdHash, testTenantId, testPurpose)
	require.NoError(t, err)
	assert.False(t, hasConsent)
}

func TestHasConsent_essential_alwaysTrue(t *testing.T) {
	_, ctx := newStubAndCtx(t, "tx-essential")

	cc := &ConsentContract{}
	hasConsent, err := cc.HasConsent(ctx, testGuestIdHash, testTenantId, "essential")
	require.NoError(t, err)
	assert.True(t, hasConsent, "essential consent must always be true without any grant on-chain")
}

func TestGetConsentHistory_returnsAllEvents(t *testing.T) {
	stub, ctx := newStubAndCtx(t, "tx-h1")

	cc := &ConsentContract{}

	require.NoError(t, cc.GrantConsent(ctx, testGuestIdHash, testTenantId, "analytics", testGrantedBy))

	stub.MockTransactionStart("tx-h2")
	require.NoError(t, cc.GrantConsent(ctx, testGuestIdHash, testTenantId, testPurpose, testGrantedBy))

	stub.MockTransactionStart("tx-h3")
	require.NoError(t, cc.RevokeConsent(ctx, testGuestIdHash, testTenantId, testPurpose, testGrantedBy))

	history, err := cc.GetConsentHistory(ctx, testGuestIdHash, testTenantId)
	require.NoError(t, err)
	assert.GreaterOrEqual(t, len(history), 3, "history should contain all consent events")

	actions := make(map[string]int)
	for _, r := range history {
		actions[r.Action]++
	}
	assert.GreaterOrEqual(t, actions["granted"], 2)
	assert.GreaterOrEqual(t, actions["revoked"], 1)
}

// assertLastEvent drains the MockStub event channel and checks the most
// recent chaincode event emitted by the transaction under test.
func assertLastEvent(t *testing.T, stub *shimtest.MockStub, want string) {
	t.Helper()
	var last *peer.ChaincodeEvent
	for {
		select {
		case ev := <-stub.ChaincodeEventsChannel:
			last = ev
			continue
		default:
		}
		break
	}
	require.NotNil(t, last, "expected a chaincode event")
	assert.Equal(t, want, last.EventName)
}
