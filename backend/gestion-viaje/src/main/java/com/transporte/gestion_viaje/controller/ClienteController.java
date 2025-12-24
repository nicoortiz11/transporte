package com.transporte.gestion_viaje.controller;

import com.transporte.gestion_viaje.model.Cliente;
import com.transporte.gestion_viaje.repository.ClienteRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/clientes")
@CrossOrigin(origins = "*") // Fundamental para que React pueda conectar
public class ClienteController {

    @Autowired
    private ClienteRepository clienteRepository;

    // Obtener la lista de todos los clientes
    @GetMapping
    public List<Cliente> listarClientes() {
        return clienteRepository.findAll();
    }

    // Crear un nuevo cliente
    @PostMapping
    public Cliente guardarCliente(@RequestBody Cliente cliente) {
        return clienteRepository.save(cliente);
    }

    @PutMapping("/{id}")
    public Cliente actualizarCliente(@PathVariable Long id, @RequestBody Cliente clienteActualizado) {
        return clienteRepository.findById(id)
                .map(cliente -> {
                    cliente.setNombre(clienteActualizado.getNombre());
                    cliente.setCuit(clienteActualizado.getCuit());
                    return clienteRepository.save(cliente);
                })
                .orElseGet(() -> {
                    clienteActualizado.setId(id);
                    return clienteRepository.save(clienteActualizado);
                });
    }

    @DeleteMapping("/{id}")
    public void eliminarCliente(@PathVariable Long id) {
        // Nota: Esto fallará si el cliente tiene viajes asociados (integridad referencial)
        clienteRepository.deleteById(id);
    }

}