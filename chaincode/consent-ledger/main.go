package main

import (
	"log"

	"github.com/hyperledger/fabric-contract-api-go/contractapi"
)

func main() {
	cc, err := contractapi.NewChaincode(&ConsentContract{})
	if err != nil {
		log.Panicf("Error creating consent chaincode: %v", err)
	}
	if err := cc.Start(); err != nil {
		log.Panicf("Error starting consent chaincode: %v", err)
	}
}
